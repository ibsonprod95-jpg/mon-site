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

function automaticReply(message, language) {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const asksAboutHoursOrPrices = /\b(horaire|horaires|heure|heures|prix|tarif|tarifs|depart|departure|departures|schedule|schedules|timetable|times|fare|fares|price|prices|woor|waxtu|njeg)\b/.test(normalized);
  const asksAboutForm = /\b(formulaire|form|fiche|declaration|declarer|pdf|report|declare|kayit|waajal)\b/.test(normalized);
  const asksAboutStatus = /\b(suivi|retrouve|retrouver|trouve|trouver|statut|dossier|reclamation|follow.?up|found|lost|track|status|item|object|bag|baggage|luggage|objet|bagage|yekkatu)\b/.test(normalized);
  const asksAboutContact = /\b(contact|whatsapp|appeler|appel|telephone|humain|service|jokkoo|woo)\b/.test(normalized);
  const isGreeting = /^(bonjour|bonsoir|salut|hello|hi|salam|nanga def)[\s!.?]*$/.test(normalized);

  if (language === 'en') {
    if (isGreeting) return 'Hello! I am the website’s automatic assistant. I can guide you through preparing a lost-baggage report. What would you like help with?';
    if (asksAboutHoursOrPrices) return 'I do not have confirmed, up-to-date information about schedules or fares. Please check with the service using the WhatsApp or call buttons on this page.';
    if (asksAboutForm) return 'Complete the form on this page with the owner’s contact details, baggage description, colour, place and date of loss, and bus number if known. Select “Export form as PDF”. The PDF is saved on your device and is not sent automatically; contact the service using the buttons below.';
    if (asksAboutStatus) return 'I cannot access lost-property records or confirm whether an item has been found. Please prepare the form on this page and contact the service using the WhatsApp or call buttons. Do not share personal details in this chat.';
    if (asksAboutContact) return 'Use the “Message us on WhatsApp” or “Call us” buttons in the contact section below to reach the service. I cannot transfer this chat or send a message on your behalf.';
    return 'I can explain how to prepare the lost-baggage form, but I cannot check a case or confirm that an item has been found. For a personal follow-up, contact the service with the WhatsApp or call buttons below. Please do not share personal details here.';
  }

  if (language === 'wo') {
    if (isGreeting) return 'Nanga def! Dimbali bu otomatik laa ci site bi. Mën naa la dimbali nga waajal kayitu yëkkatu bi réer. Lan nga bëgg ma dimbali la ci?';
    if (asksAboutHoursOrPrices) return 'Amuma xibaar bu wóor te bees ci waxtu walla njëg. Jokkoole ak sarwiis bi ci WhatsApp walla woo leen ci butoŋ yi ci xët wii.';
    if (asksAboutForm) return 'Dugalal tur ak nimero telefon ci formileer bi, melokaanu yëkkatu bi, fu mu réer ak bés bi, ak nimero bas bi su fekkee xam nga ko. Tànnal « Génne kayit bi ci PDF ». Kayit bi du yónnee boppam ci sarwiis bi; jokkoole ak ñoom ci butoŋ yi ci suuf.';
    if (asksAboutStatus) return 'Mëneesuma seet kayit yi walla xam ndax gis nañu yëkkatu bi. Waajal kayit bi ci xët wii te jokkoole ak sarwiis bi ci WhatsApp walla woo leen. Bul bind xibaaru bopp ci waxtaan wi.';
    if (asksAboutContact) return 'Tànnal butoŋ « Bindal nu ci WhatsApp » walla « Woo nu » ci xët wii ngir jokkoo ak sarwiis bi. Mëneesuma yónnee bataaxal ci sa tur.';
    return 'Mën naa la dimbali ci waajal kayitu yëkkatu bi, waaye mëneesuma seet sa dosiye walla xam ndax gis nañu ko. Ngir jokkoo ak sarwiis bi, tànnal WhatsApp walla woo nu ci butoŋ yi ci suuf. Bul bind xibaaru bopp ci fii.';
  }

  if (isGreeting) return 'Bonjour ! Je suis l’assistant automatique du site. Je peux vous guider pour préparer une déclaration de bagage perdu. Que souhaitez-vous savoir ?';
  if (asksAboutHoursOrPrices) return 'Je n’ai pas d’information confirmée et à jour sur les horaires ou les tarifs. Pour les vérifier, contactez le service avec les boutons WhatsApp ou Appeler de cette page.';
  if (asksAboutForm) return 'Remplissez le formulaire de cette page avec les coordonnées du propriétaire, la description et la couleur du bagage, le lieu et la date de perte, et le numéro du bus si vous le connaissez. Choisissez « Exporter la fiche en PDF ». Le PDF reste sur votre appareil et n’est pas envoyé automatiquement : contactez ensuite le service avec les boutons ci-dessous.';
  if (asksAboutStatus) return 'Je ne peux pas consulter les objets retrouvés ni vérifier l’état d’un dossier. Préparez la fiche sur cette page, puis contactez le service avec les boutons WhatsApp ou Appeler. Ne partagez pas vos données personnelles dans ce chat.';
  if (asksAboutContact) return 'Pour joindre le service, utilisez les boutons « Écrire sur WhatsApp » ou « Appeler » dans la rubrique de contact ci-dessous. Je ne peux pas transférer cette conversation ni envoyer un message à votre place.';
  return 'Je peux expliquer comment préparer la fiche de bagage perdu, mais je ne peux pas vérifier un dossier ni confirmer qu’un objet a été retrouvé. Pour un suivi personnalisé, contactez le service avec les boutons WhatsApp ou Appeler ci-dessous. Ne partagez pas de données personnelles dans ce chat.';
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      reply: automaticReply(messages[messages.length - 1].content, language),
      mode: 'automatic'
    });
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
