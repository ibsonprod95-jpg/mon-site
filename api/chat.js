const SYSTEM_PROMPT = `Tu es l'assistant du formulaire « Objets et bagages perdus » d'AIBD DEM DIKK SA.
Utilise des phrases simples, polies et concises. Aide les visiteurs à comprendre le formulaire et à préparer une déclaration.
Le formulaire permet de préparer une fiche PDF sur l'appareil : nom et téléphone du propriétaire, description et couleur du bagage, lieu (AIBD ou HLM GRAND YOFF), date de perte, numéro du bus, et ajout facultatif de photos. La fiche n'est pas automatiquement transmise au service.
Tu ne peux ni consulter les fiches, ni suivre une recherche, ni confirmer qu'un objet a été retrouvé.
Ne demande jamais de nom, numéro de téléphone, numéro de ticket ou autre donnée personnelle dans la conversation. Invite l'utilisateur à saisir les renseignements dans le formulaire et à ne pas les partager dans le chat. N'invente pas de procédure, de délai ou de garantie officielle. Si une question dépasse les informations de cette page, dis-le clairement et invite l'utilisateur à utiliser les moyens de contact affichés sur le site.`;

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1200;
const ERROR_MESSAGES = {
  fr: {
    notAllowed: 'Méthode non autorisée.',
    notConfigured: 'L’assistant n’est pas encore configuré.',
    invalidLanguage: 'Langue non prise en charge.',
    originNotAllowed: 'Origine de requête non autorisée.',
    invalidOrigin: 'Origine de requête invalide.',
    invalidConversation: 'Format de conversation invalide.',
    invalidMessage: 'Un message est vide ou trop long.',
    mustEndWithQuestion: 'La conversation doit se terminer par une question.',
    aiConnectionError: 'Impossible de joindre le service IA pour le moment.',
    aiError: 'Le service IA a rencontré une erreur. Réessayez plus tard.',
    aiInvalidJson: 'Le service IA a renvoyé une réponse invalide.',
    aiNoReply: 'Le service IA n’a pas fourni de réponse.'
  },
  en: {
    notAllowed: 'Method not allowed.',
    notConfigured: 'The assistant has not been configured yet.',
    invalidLanguage: 'Unsupported language.',
    originNotAllowed: 'Request origin not allowed.',
    invalidOrigin: 'Invalid request origin.',
    invalidConversation: 'Invalid conversation format.',
    invalidMessage: 'A message is empty or too long.',
    mustEndWithQuestion: 'The conversation must end with a question.',
    aiConnectionError: 'Could not reach the AI service. Please try again later.',
    aiError: 'The AI service encountered an error. Please try again later.',
    aiInvalidJson: 'The AI service returned an invalid response.',
    aiNoReply: 'The AI service did not provide a reply.'
  },
  wo: {
    notAllowed: 'Jëf ji kenn mayuko.',
    notConfigured: 'Dimbali bi ñu paregul.',
    invalidLanguage: 'Làkk wi kenn dugaluko.',
    originNotAllowed: 'Bunt bii kenn mayuko.',
    invalidOrigin: 'Bunt bu ñu yónnee laaj bi baaxul.',
    invalidConversation: 'Melokaanu waxtaan wi baaxul.',
    invalidMessage: 'Benn bataaxal dafa féex walla dafa gudd lool.',
    mustEndWithQuestion: 'Waxtaan wi war na jeex ak laaj.',
    aiConnectionError: 'Mëneesula jot ci sarwiisu IA. Jéemaatal ci kanam.',
    aiError: 'Sarwiisu IA am na jafe-jafe. Jéemaatal ci kanam.',
    aiInvalidJson: 'Sarwiisu IA delloo tontu bu baaxul.',
    aiNoReply: 'Sarwiisu IA tontuwul.'
  }
};

function errorMessage(language, key) {
  return ERROR_MESSAGES[language][key] || ERROR_MESSAGES.fr[key];
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: errorMessage('fr', 'notAllowed') });
  }

  const body = req.body;
  const language = body && body.language !== undefined ? body.language : 'fr';
  if (!Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, language)) {
    return res.status(400).json({ error: errorMessage('fr', 'invalidLanguage') });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: errorMessage(language, 'notConfigured') });
  }

  const configuredOrigin = process.env.SITE_ORIGIN;
  const requestOrigin = req.headers.origin;
  if (configuredOrigin && requestOrigin) {
    try {
      if (new URL(requestOrigin).origin !== new URL(configuredOrigin).origin) {
        return res.status(403).json({ error: errorMessage(language, 'originNotAllowed') });
      }
    } catch (error) {
      return res.status(400).json({ error: errorMessage(language, 'invalidOrigin') });
    }
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) ||
      body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: errorMessage(language, 'invalidConversation') });
  }

  const messages = [];
  for (const message of body.messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        message.content.trim().length === 0 ||
        message.content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: errorMessage(language, 'invalidMessage') });
    }
    messages.push({ role: message.role, content: message.content.trim() });
  }

  if (messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: errorMessage(language, 'mustEndWithQuestion') });
  }

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT + '\nRespond in ' + {
          fr: 'French.',
          en: 'English.',
          wo: 'Wolof. Use clear, natural Wolof and keep official names and contact details unchanged.'
        }[language],
        messages: messages
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    console.error('Anthropic API request failed:', error);
    return res.status(error.name === 'TimeoutError' ? 504 : 502)
      .json({ error: errorMessage(language, 'aiConnectionError') });
  }

  if (!upstream.ok) {
    console.error('Anthropic API returned status:', upstream.status);
    return res.status(502).json({ error: errorMessage(language, 'aiError') });
  }

  let result;
  try {
    result = await upstream.json();
  } catch (error) {
    console.error('Anthropic API returned invalid JSON:', error);
    return res.status(502).json({ error: errorMessage(language, 'aiInvalidJson') });
  }

  const textBlock = result && Array.isArray(result.content)
    ? result.content.find(function (block) { return block && block.type === 'text'; })
    : null;
  if (!textBlock || typeof textBlock.text !== 'string' || !textBlock.text.trim()) {
    console.error('Anthropic API response did not contain text.');
    return res.status(502).json({ error: errorMessage(language, 'aiNoReply') });
  }

  return res.status(200).json({ reply: textBlock.text.trim() });
};
