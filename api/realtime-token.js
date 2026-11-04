const INSTRUCTIONS = {
  fr: 'Tu es l’assistant du site AIBD DEM DIKK pour les objets et bagages perdus. Réponds en français avec des phrases simples et concises. Aide à comprendre les informations du site et à préparer une déclaration. Ne demande ni nom, ni téléphone, ni code privé ou autre donnée personnelle. Tu ne peux pas consulter les dossiers ; pour un suivi, indique la rubrique « Suivre ma déclaration ». N’invente pas de procédure, de délai ou de garantie.',
  en: 'You are the AIBD DEM DIKK lost property website assistant. Reply in English using simple, concise sentences. Help visitors understand the website and prepare a report. Never ask for names, phone numbers, private codes, or other personal information. You cannot access reports; direct visitors to the report tracking section. Do not invent procedures, timeframes, or guarantees.',
  wo: 'Yaw nga di dimbali ci site bu AIBD DEM DIKK ngir yëkkatu yi ñu réer. Tontul ci wolof bu leer te gàtt. Dimbali nit ñi xam site bi ak waajal kayit. Bul laaj tur, nimero telefon, kodu sutura, walla xibaaru bopp. Mëneesula xool kayit yi; ngir topp kayit, waxal ci « Suivre ma déclaration ». Bul sos yoon, waxtu, walla garanti.',
};

function respond(res, status, body) {
  return res.status(status).json(body);
}

function getAllowedOrigin() {
  const configuredOrigin = process.env.SITE_ORIGIN;
  if (!configuredOrigin) return null;

  try {
    const url = new URL(configuredOrigin);
    const isLocalHttp = url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if ((!isLocalHttp && url.protocol !== 'https:') ||
        url.origin !== configuredOrigin.replace(/\/$/, '') ||
        url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { error: 'Méthode non autorisée.' });
  }

  const allowedOrigin = getAllowedOrigin();
  if (!allowedOrigin) {
    return respond(res, 503, { error: 'Le service vocal n’est pas encore configuré.' });
  }

  const requestOrigin = req.headers.origin;
  if (!requestOrigin) {
    return respond(res, 403, { error: 'Origine de requête non autorisée.' });
  }
  try {
    if (new URL(requestOrigin).origin !== allowedOrigin) {
      return respond(res, 403, { error: 'Origine de requête non autorisée.' });
    }
  } catch {
    return respond(res, 400, { error: 'Origine de requête invalide.' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'language') ||
      (body.language !== undefined && !Object.hasOwn(INSTRUCTIONS, body.language))) {
    return respond(res, 400, { error: 'Requête vocale invalide.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return respond(res, 503, { error: 'Le service vocal n’est pas encore configuré.' });
  }

  const language = body.language || 'fr';
  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 60 },
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          instructions: INSTRUCTIONS[language],
          audio: {
            input: {
              transcription: { model: 'gpt-4o-mini-transcribe' },
              turn_detection: { type: 'semantic_vad' }
            },
            output: { voice: 'marin' }
          }
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    console.error('OpenAI Realtime session request failed:', error);
    return respond(res, error.name === 'TimeoutError' ? 504 : 502, {
      error: 'Impossible de démarrer la conversation vocale pour le moment.'
    });
  }

  if (!upstream.ok) {
    console.error('OpenAI Realtime session request returned status:', upstream.status);
    return respond(res, 502, {
      error: 'Impossible de démarrer la conversation vocale pour le moment.'
    });
  }

  let result;
  try {
    result = await upstream.json();
  } catch (error) {
    console.error('OpenAI Realtime session response was invalid JSON:', error);
    return respond(res, 502, {
      error: 'Le service vocal a renvoyé une réponse invalide.'
    });
  }

  const value = result && typeof result.value === 'string'
    ? result.value
    : result && result.client_secret && result.client_secret.value;
  if (typeof value !== 'string' || !value) {
    console.error('OpenAI Realtime session response did not contain a client secret.');
    return respond(res, 502, {
      error: 'Le service vocal a renvoyé une réponse invalide.'
    });
  }

  return respond(res, 200, {
    value,
    expires_at: result.expires_at || (result.client_secret && result.client_secret.expires_at)
  });
};
