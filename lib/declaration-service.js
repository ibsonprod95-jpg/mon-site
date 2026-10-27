const crypto = require('crypto');
const net = require('net');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getConfig() {
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ADMIN_EMAIL,
    SITE_ORIGIN,
    CRON_SECRET,
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
    DECLARATION_PRIVACY_NOTICES
  } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY ||
      !SUPABASE_ADMIN_EMAIL || !SITE_ORIGIN || !CRON_SECRET ||
      !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN ||
      !DECLARATION_PRIVACY_NOTICES) {
    throw new HttpError(503, 'Le suivi en ligne n’est pas encore configuré.');
  }
  let baseUrl;
  let allowedOrigin;
  let rateLimitUrl;
  let privacyNotices;
  try {
    const supabaseUrl = new URL(SUPABASE_URL);
    const siteUrl = new URL(SITE_ORIGIN);
    rateLimitUrl = new URL(UPSTASH_REDIS_REST_URL);
    if (supabaseUrl.protocol !== 'https:' || siteUrl.protocol !== 'https:' ||
        rateLimitUrl.protocol !== 'https:' || rateLimitUrl.username || rateLimitUrl.password ||
        rateLimitUrl.search || rateLimitUrl.hash) {
      throw new Error('HTTPS required');
    }
    baseUrl = supabaseUrl.origin;
    allowedOrigin = siteUrl.origin;
    privacyNotices = JSON.parse(DECLARATION_PRIVACY_NOTICES);
  } catch {
    throw new HttpError(503, 'La configuration du suivi en ligne est invalide.');
  }
  if (!privacyNotices || typeof privacyNotices !== 'object' ||
      ['fr', 'en', 'wo'].some(language =>
        typeof privacyNotices[language] !== 'string' ||
        privacyNotices[language].trim().length < 80 ||
        privacyNotices[language].length > 2000)) {
    throw new HttpError(503, 'Les informations de confidentialité du suivi sont incomplètes.');
  }
  return {
    baseUrl,
    anonKey: SUPABASE_ANON_KEY,
    serviceKey: SUPABASE_SERVICE_ROLE_KEY,
    allowedOrigin,
    cronSecret: CRON_SECRET,
    rateLimitUrl: rateLimitUrl.origin,
    rateLimitToken: UPSTASH_REDIS_REST_TOKEN,
    privacyNotices
  };
}

async function supabase(config, path, options = {}) {
  let response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        ...(options.body && !(options.body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new HttpError(502, 'Le service de suivi est momentanément inaccessible. Réessayez.');
  }
  if (!response.ok) {
    const error = new Error(`Supabase request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function rateLimit(config, req, action, limit, windowSeconds) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : '';
  if (!net.isIP(clientIp)) {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible.');
  }

  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const keyHash = crypto.createHash('sha256').update(clientIp).digest('hex');
  const key = `aibd:declarations:${action}:${window}:${keyHash}`;
  const script = [
    "local count = redis.call('INCR', KEYS[1])",
    "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
    'return count'
  ].join('; ');
  let response;
  try {
    response = await fetch(config.rateLimitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.rateLimitToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['EVAL', script, 1, key, windowSeconds * 2]),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible. Réessayez.');
  }
  if (!response.ok) {
    console.error('Declaration rate-limit service failed:', response.status);
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible. Réessayez.');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible. Réessayez.');
  }
  if (!result || !Number.isInteger(result.result) || result.result < 1) {
    console.error('Declaration rate-limit service returned an invalid response.');
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible. Réessayez.');
  }
  if (result.result > limit) {
    throw new HttpError(429, 'Trop de tentatives. Veuillez réessayer plus tard.');
  }
}

async function checkRateLimitStorage(config) {
  let response;
  try {
    response = await fetch(config.rateLimitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.rateLimitToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['PING']),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible.');
  }
  if (!response.ok) {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible.');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible.');
  }
  if (!result || result.result !== 'PONG') {
    throw new HttpError(503, 'La protection contre les envois abusifs est indisponible.');
  }
}

module.exports = { HttpError, checkRateLimitStorage, getConfig, rateLimit, supabase };
