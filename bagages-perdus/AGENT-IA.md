# Assistant IA du formulaire

L'assistant de la page `index.html` répond aux questions sur le formulaire et aide à préparer une déclaration. Il répond dans la langue choisie sur le site : français, anglais ou wolof. Il ne consulte pas les déclarations enregistrées dans le navigateur et ne peut pas suivre un objet.

## Mise en ligne sur Vercel

Le projet doit être déployé depuis la racine du dépôt pour que Vercel détecte `api/chat.js` comme fonction serveur.

1. Créez une clé API dans la console Anthropic.
2. Dans les paramètres Vercel du projet, ajoutez la variable d'environnement `ANTHROPIC_API_KEY` avec cette clé. Ne mettez jamais la clé dans un fichier HTML, dans Git ou dans une conversation.
3. Facultatif : définissez `ANTHROPIC_MODEL` pour choisir un autre modèle Anthropic. Par défaut, l'API utilise `claude-haiku-4-5-20251001`.
4. Facultatif : définissez `SITE_ORIGIN` avec l'origine du site, par exemple `https://exemple.vercel.app`, pour refuser les requêtes provenant d'une autre origine navigateur.
5. Redéployez le site après avoir ajouté les variables.

La fonction limite les conversations à 12 messages, les messages à 1 200 caractères et la réponse à 500 jetons. Configurez également des limites d'utilisation ou de dépenses dans votre compte Anthropic : la route publique ne remplace pas une protection anti-abus ou une limitation persistante par adresse IP.

## Données et confidentialité

Seuls les messages saisis dans l'assistant sont envoyés à l'API Anthropic, via la fonction serveur. Les déclarations `localStorage` ne sont jamais ajoutées à la conversation. L'assistant avertit les visiteurs de ne pas y saisir de nom ni de numéro de téléphone.
