const crypto = require('crypto');
const {
  HttpError,
  checkRateLimitStorage,
  getConfig,
  rateLimit,
  supabase
} = require('../lib/declaration-service');

const BUCKET = 'declaration-photos';
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const STATUSES = new Set(['received', 'searching', 'found', 'closed']);
const LOCATIONS = new Set(['AIBD', 'HLM GRAND YOFF', 'TERMINUS GUEDIAWAYE']);

function respond(res, status, body) {
  return res.status(status).json(body);
}

function checkOrigin(req, config) {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) throw new HttpError(403, 'Origine de requête non autorisée.');
  let normalized;
  try {
    normalized = new URL(requestOrigin).origin;
  } catch {
    throw new HttpError(400, 'Origine de requête invalide.');
  }
  if (normalized !== config.allowedOrigin) {
    throw new HttpError(403, 'Origine de requête non autorisée.');
  }
}

function getBody(req) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Données de déclaration invalides.');
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Les photos sont trop volumineuses. Choisissez des photos plus petites.');
  }
  return body;
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} manquant ou trop long.`);
  }
  return value.trim();
}

function validUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseImage(dataUrl, prefix) {
  if (dataUrl === null || dataUrl === undefined || dataUrl === '') return null;
  if (typeof dataUrl !== 'string') throw new HttpError(400, 'Photo invalide.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new HttpError(400, 'Format de photo non accepté.');
  const contentType = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'Chaque photo doit faire au maximum 1 Mo.');
  }
  const isJpeg = contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = contentType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = contentType === 'image/webp' &&
    bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw new HttpError(400, 'Le contenu de la photo est invalide.');
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.slice(6);
  return { path: `${prefix}.${extension}`, contentType, bytes };
}

async function uploadImage(config, declarationId, image) {
  if (!image) return null;
  const path = `${declarationId}/${image.path}`;
  await supabase(config, `/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': image.contentType, 'x-upsert': 'false' },
    body: image.bytes
  });
  return path;
}

async function removeUploadedImages(config, paths) {
  if (!paths.length) return;
  try {
    await supabase(config, `/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: paths })
    });
  } catch (error) {
    console.error('Declaration photo cleanup failed:', error.message);
  }
}

async function signedPhoto(config, path) {
  if (!path) return null;
  const result = await supabase(config, `/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    body: JSON.stringify({ expiresIn: 3600 })
  });
  if (!result || typeof result.signedURL !== 'string') {
    throw new HttpError(502, 'Impossible de charger une photo pour le moment.');
  }
  return `${config.baseUrl}/storage/v1${result.signedURL}`;
}

async function findDeclaration(config, trackingCode) {
  const params = new URLSearchParams({
    select: 'id,tracking_code,access_secret_hash,owner_name,phone,description,color,lost_location,lost_date,bus_number,photo_path,ticket_path,status,created_at,updated_at',
    tracking_code: `eq.${trackingCode}`,
    limit: '1'
  });
  const rows = await supabase(config, `/rest/v1/declarations?${params}`);
  return rows[0] || null;
}

async function adminLogin(config, body) {
  const email = requiredText(body.email, 'Adresse e-mail', 254).toLowerCase();
  if (typeof body.password !== 'string' || !body.password || body.password.length > 256) {
    throw new HttpError(400, 'Mot de passe invalide.');
  }
  const password = body.password;
  const adminEmail = process.env.SUPABASE_ADMIN_EMAIL;
  if (!adminEmail || email !== adminEmail.toLowerCase()) {
    throw new HttpError(401, 'Identifiants incorrects.');
  }
  let response;
  try {
    response = await fetch(`${config.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new HttpError(502, 'Connexion au service impossible. Réessayez.');
  }
  if (!response.ok) throw new HttpError(401, 'Identifiants incorrects.');
  const session = await response.json();
  if (!session.user || typeof session.user.email !== 'string' ||
      session.user.email.toLowerCase() !== adminEmail.toLowerCase() ||
      typeof session.access_token !== 'string') {
    throw new HttpError(401, 'Identifiants incorrects.');
  }
  return { token: session.access_token, expiresIn: session.expires_in };
}

async function checkAdmin(config, token) {
  if (typeof token !== 'string' || !token || !process.env.SUPABASE_ADMIN_EMAIL) {
    throw new HttpError(401, 'Connexion au service requise.');
  }
  let response;
  try {
    response = await fetch(`${config.baseUrl}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new HttpError(502, 'Vérification de la connexion impossible. Réessayez.');
  }
  if (!response.ok) throw new HttpError(401, 'Session expirée. Reconnectez-vous.');
  const user = await response.json();
  if (typeof user.email !== 'string' ||
      user.email.toLowerCase() !== process.env.SUPABASE_ADMIN_EMAIL.toLowerCase()) {
    throw new HttpError(403, 'Accès réservé au compte de service autorisé.');
  }
}

async function submit(config, body) {
  if (body.consent !== true) throw new HttpError(400, 'Votre consentement est nécessaire pour enregistrer la déclaration.');
  const ownerName = requiredText(body.ownerName, 'Le nom', 120);
  const phone = requiredText(body.phone, 'Le téléphone', 40);
  const description = requiredText(body.description, 'La description', 1200);
  const color = body.color === undefined ? '' : requiredText(body.color, 'La couleur', 7);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, 'Couleur invalide.');
  if (!LOCATIONS.has(body.location)) throw new HttpError(400, 'Lieu de perte invalide.');
  const parsedDate = typeof body.lostDate === 'string'
    ? new Date(`${body.lostDate}T00:00:00Z`)
    : null;
  if (typeof body.lostDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.lostDate) ||
      !parsedDate || Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== body.lostDate) {
    throw new HttpError(400, 'Date de perte invalide.');
  }
  const busNumber = typeof body.busNumber === 'string' ? body.busNumber.trim() : '';
  if (busNumber.length > 80) throw new HttpError(400, 'Le numéro du bus est trop long.');
  const id = crypto.randomUUID();
  const trackingCode = `AIBD-${crypto.randomBytes(7).toString('hex').toUpperCase()}`;
  const accessSecret = crypto.randomBytes(24).toString('base64url');
  const accessSecretHash = crypto.createHash('sha256').update(accessSecret).digest('hex');
  const photos = [
    parseImage(body.photo, 'baggage'),
    parseImage(body.ticketPhoto, 'ticket')
  ];
  const uploaded = [];
  try {
    const photoPath = await uploadImage(config, id, photos[0]);
    if (photoPath) uploaded.push(photoPath);
    const ticketPath = await uploadImage(config, id, photos[1]);
    if (ticketPath) uploaded.push(ticketPath);
    const rows = await supabase(config, `/rest/v1/rpc/create_lost_declaration`, {
      method: 'POST',
      body: JSON.stringify({
        p_id: id,
        p_tracking_code: trackingCode,
        p_access_secret_hash: accessSecretHash,
        p_owner_name: ownerName,
        p_phone: phone,
        p_description: description,
        p_color: color,
        p_lost_location: body.location,
        p_lost_date: body.lostDate,
        p_bus_number: busNumber || null,
        p_photo_path: photoPath,
        p_ticket_path: ticketPath
      })
    });
    const declaration = Array.isArray(rows) ? rows[0] : rows;
    return {
      trackingCode,
      accessSecret,
      status: declaration.status,
      createdAt: declaration.created_at
    };
  } catch (error) {
    await removeUploadedImages(config, uploaded);
    if (error instanceof HttpError) throw error;
    if (error.status === 409) throw new HttpError(503, 'Création impossible pour le moment. Réessayez.');
    console.error('Declaration creation failed:', error.message);
    throw new HttpError(502, 'Enregistrement impossible pour le moment. Réessayez.');
  }
}

async function track(config, body) {
  const trackingCode = requiredText(body.trackingCode, 'Le code de suivi', 40).toUpperCase();
  const secret = requiredText(body.accessSecret, 'Le code privé', 100);
  const declaration = await findDeclaration(config, trackingCode);
  if (!declaration) throw new HttpError(404, 'Dossier introuvable ou codes incorrects.');
  const suppliedHash = crypto.createHash('sha256').update(secret).digest();
  const storedHash = Buffer.from(declaration.access_secret_hash, 'hex');
  if (storedHash.length !== suppliedHash.length || !crypto.timingSafeEqual(storedHash, suppliedHash)) {
    throw new HttpError(404, 'Dossier introuvable ou codes incorrects.');
  }
  const params = new URLSearchParams({
    select: 'status,note,created_at',
    declaration_id: `eq.${declaration.id}`,
    order: 'created_at.asc'
  });
  const history = await supabase(config, `/rest/v1/declaration_status_history?${params}`);
  return {
    trackingCode: declaration.tracking_code,
    status: declaration.status,
    updatedAt: declaration.updated_at,
    history,
    photos: {
      baggage: await signedPhoto(config, declaration.photo_path),
      ticket: await signedPhoto(config, declaration.ticket_path)
    }
  };
}

async function adminList(config, token) {
  await checkAdmin(config, token);
  const params = new URLSearchParams({
    select: 'id,tracking_code,owner_name,phone,description,color,lost_location,lost_date,bus_number,photo_path,ticket_path,status,created_at,updated_at',
    order: 'created_at.desc',
    limit: '100'
  });
  return supabase(config, `/rest/v1/declarations?${params}`);
}

async function adminUpdate(config, body) {
  await checkAdmin(config, body.token);
  if (!validUuid(body.id)) throw new HttpError(400, 'Dossier invalide.');
  if (!STATUSES.has(body.status)) throw new HttpError(400, 'Statut invalide.');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) throw new HttpError(400, 'La note est trop longue.');
  const result = await supabase(config, '/rest/v1/rpc/update_lost_declaration_status', {
    method: 'POST',
    body: JSON.stringify({ p_id: body.id, p_status: body.status, p_note: note })
  });
  return Array.isArray(result) ? result[0] : result;
}

async function adminPhoto(config, body) {
  await checkAdmin(config, body.token);
  if (!validUuid(body.id) || !['baggage', 'ticket'].includes(body.kind)) {
    throw new HttpError(400, 'Photo invalide.');
  }
  const params = new URLSearchParams({ select: 'photo_path,ticket_path', id: `eq.${body.id}`, limit: '1' });
  const rows = await supabase(config, `/rest/v1/declarations?${params}`);
  if (!rows.length) throw new HttpError(404, 'Dossier introuvable.');
  const path = body.kind === 'baggage' ? rows[0].photo_path : rows[0].ticket_path;
  if (!path) throw new HttpError(404, 'Aucune photo pour ce dossier.');
  return { url: await signedPhoto(config, path) };
}

async function healthCheck(config, language) {
  try {
    await supabase(config, '/rest/v1/declarations?select=id&limit=1');
    await supabase(config, `/storage/v1/bucket/${BUCKET}`);
    await checkRateLimitStorage(config);
    return {
      configured: true,
      privacyNotice: config.privacyNotices[language].trim()
    };
  } catch (error) {
    console.error('Declaration service health check failed:', error.message);
    throw new HttpError(503, 'Le suivi doit être configuré dans Supabase avant utilisation.');
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { error: 'Méthode non autorisée.' });
  }

  try {
    const config = getConfig();
    checkOrigin(req, config);
    const body = getBody(req);
    const limits = {
      submit: [5, 3600],
      track: [60, 3600],
      'admin-login': [10, 3600],
      'admin-list': [60, 3600],
      'admin-update': [30, 3600],
      'admin-photo': [60, 3600],
      health: [120, 3600]
    };
    const limit = limits[body.action];
    if (!limit) throw new HttpError(400, 'Action de suivi invalide.');
    await rateLimit(config, req, body.action, limit[0], limit[1]);
    let result;
    switch (body.action) {
      case 'health':
        result = await healthCheck(
          config,
          ['fr', 'en', 'wo'].includes(body.language) ? body.language : 'fr'
        );
        break;
      case 'submit':
        result = await submit(config, body);
        break;
      case 'track':
        result = await track(config, body);
        break;
      case 'admin-login':
        result = await adminLogin(config, body);
        break;
      case 'admin-list':
        result = await adminList(config, body.token);
        break;
      case 'admin-update':
        result = await adminUpdate(config, body);
        break;
      case 'admin-photo':
        result = await adminPhoto(config, body);
        break;
      default:
        throw new HttpError(400, 'Action de suivi invalide.');
    }
    return respond(res, 200, result);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 429) res.setHeader('Retry-After', '3600');
      return respond(res, error.status, { error: error.message });
    }
    console.error('Declaration API failed:', error.message);
    return respond(res, 502, { error: 'Le service de suivi a rencontré une erreur. Réessayez.' });
  }
};
