# Conversation vocale Realtime

La conversation vocale utilise la fonction Node.js `api/realtime-token.js` hébergée avec les autres fonctions Vercel du site. La clé OpenAI reste dans l’environnement serveur ; le navigateur ne reçoit qu’un jeton Realtime éphémère pour établir la connexion WebRTC.

## Configuration

Dans **Vercel → Project → Settings → Environment Variables**, ajoutez :

| Variable | Valeur |
| --- | --- |
| `OPENAI_API_KEY` | Clé API secrète OpenAI, uniquement côté serveur |
| `SITE_ORIGIN` | Origine exacte du site, par exemple `https://exemple.vercel.app` |

N’ajoutez pas `OPENAI_API_KEY` au HTML, au JavaScript du navigateur, ni à une variable préfixée `VITE_`, `NEXT_PUBLIC_` ou équivalente. Après avoir défini les variables, redéployez le site.

En local, utilisez Vercel CLI (`vercel dev`) avec ces variables définies dans l’environnement local ou dans un fichier `.env.local` non versionné. Pour tester sur localhost, définissez `SITE_ORIGIN=http://localhost:3000`.

## Vérification

Ouvrez le site sur une origine HTTPS (ou localhost), ouvrez **Besoin d’aide ?**, puis choisissez **Conversation vocale** et autorisez le microphone. Le bouton permet ensuite de terminer l’appel. Le navigateur envoie l’offre WebRTC directement à OpenAI avec le jeton éphémère ; la clé secrète ne quitte jamais le backend.

L’audio est transmis à OpenAI pour la conversation vocale. Informez les utilisateurs avant d’activer cette fonction et vérifiez les paramètres de confidentialité et de conservation applicables à votre compte OpenAI. Configurez également les limites de dépenses et surveillez l’usage de l’API.
