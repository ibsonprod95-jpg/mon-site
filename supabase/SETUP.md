
# Configurer le suivi des déclarations

Le suivi reste désactivé tant que Supabase, Upstash Redis et les informations de confidentialité ne sont pas configurés. Ne publiez jamais de clé privée, notamment `service_role`, dans le site, dans GitHub ou dans une conversation.

## 1. Créer la base et le stockage privé

1. Créez un projet Supabase et gardez son URL et ses clés dans un gestionnaire sécurisé.
2. Dans **SQL Editor**, exécutez le contenu de [`schema.sql`](./schema.sql).
   Si le schéma a déjà été installé, exécutez aussi les migrations [`20261028_add_terminus_guediawaye.sql`](./migrations/20261028_add_terminus_guediawaye.sql), [`20261028_add_lost_time_slot.sql`](./migrations/20261028_add_lost_time_slot.sql) et [`20261031_add_confused_baggage_reports.sql`](./migrations/20261031_add_confused_baggage_reports.sql) pour appliquer les changements correspondants.
3. Vérifiez que le bucket `declaration-photos` existe et qu’il est privé.
4. Dans **Authentication**, créez le compte du personnel qui administrera les déclarations. Désactivez les inscriptions publiques et n’autorisez que les comptes du service.

Le navigateur public n’accède jamais directement aux tables ni au bucket. Les fonctions Vercel utilisent la clé privée côté serveur ; les photos sont consultables à l’aide de liens temporaires après vérification des codes ou de la session du personnel. Upstash Redis applique des limites horaires aux envois, aux consultations et aux actions du personnel ; si sa protection n’est pas disponible, l’API refuse les requêtes.

## 2. Configurer la protection contre les abus

1. Créez une base Redis dans Upstash et activez son API REST en HTTPS.
2. Gardez son URL REST et son jeton privé dans un gestionnaire sécurisé.
3. Vercel limitera notamment les nouvelles déclarations à 5 par heure par adresse IP et les vérifications de suivi à 60 par heure. L’application hache l’adresse pour limiter le stockage des données techniques.

## 3. Définir les informations de confidentialité

Avant d’activer l’enregistrement de données personnelles, faites valider par le responsable du service un avis clair précisant au minimum :

- le responsable du traitement et un moyen de le contacter ;
- les données enregistrées (coordonnées, déclaration et photos facultatives) et leur usage ;
- la durée de conservation (les dossiers actifs et photos sont purgés quotidiennement au bout d’un mois) et ce qui arrive aux sauvegardes ;
- les modalités de demande d’accès, de rectification ou de suppression ;
- l’hébergement du projet Supabase et tout transfert de données éventuel.

Traduisez l’avis en français, anglais et wolof. Ajoutez-le à Vercel sous la variable `DECLARATION_PRIVACY_NOTICES`, au format JSON sur une seule ligne :

```json
{"fr":"Avis français validé par le service","en":"Notice translated and validated by the service","wo":"Xibaar wu sarwiis bi tekki te nangu"}
```

Remplacez les trois exemples par les avis complets et exacts, pas par ce texte d’exemple. Chaque avis doit faire au moins 80 caractères. L’application les affiche avant la case de consentement et ne permet pas l’envoi ou le suivi si l’avis ou la base n’est pas configuré.

## 4. Ajouter les variables Vercel

Dans **Vercel → Project → Settings → Environment Variables**, ajoutez ces variables pour chaque environnement utilisé :

| Variable | Valeur |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | clé publique `anon`/publishable, utilisée uniquement côté serveur pour la connexion du personnel |
| `SUPABASE_SERVICE_ROLE_KEY` | clé privée `service_role`/secret ; uniquement dans les variables serveur Vercel |
| `SUPABASE_ADMIN_EMAIL` | adresse exacte du compte du personnel autorisé |
| `SITE_ORIGIN` | origine exacte du site, par exemple `https://ibrahima-ndiaye.vercel.app` |
| `CRON_SECRET` | secret aléatoire privé utilisé par Vercel Cron pour autoriser la purge quotidienne |
| `UPSTASH_REDIS_REST_URL` | URL HTTPS de l’API REST de votre base Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | jeton privé de l’API REST Upstash |
| `DECLARATION_PRIVACY_NOTICES` | avis validés en JSON comme décrit ci-dessus |

N’ajoutez pas de barre oblique finale à `SITE_ORIGIN`. Après chaque changement de variable, redéployez le projet.

Le fichier [`../vercel.json`](../vercel.json) planifie la purge tous les jours à 02:00 UTC. Configurez `CRON_SECRET` dans les variables serveur de Vercel et vérifiez dans le tableau de bord **Cron Jobs** que le travail s’exécute après le déploiement de production. Il supprime les anciennes photos du bucket privé et les lignes de déclaration (avec leur historique). Les sauvegardes du fournisseur peuvent avoir une durée distincte : indiquez-la dans l’avis de confidentialité après vérification des paramètres de votre projet Supabase.

La purge nécessite uniquement `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`. Elle peut ainsi continuer à supprimer les dossiers arrivés à échéance même si Upstash ou l’avis de confidentialité est temporairement mal configuré. L’envoi et le suivi restent, eux, désactivés tant que toute la configuration n’est pas valide.

## 5. Vérifier avant ouverture au public

- Ouvrez le site déployé : les boutons de suivi restent désactivés tant que l’API ne confirme pas la configuration.
- Créez un dossier de test, conservez les deux codes, puis consultez-le dans la rubrique **Suivre une déclaration**.
- Connectez-vous sur `/admin.html` avec le compte autorisé, modifiez le statut et vérifiez que le client voit l’historique.
- Testez les deux photos, les codes erronés, le refus du consentement et les comptes de personnel non autorisés.
- Vérifiez les journaux Vercel du travail quotidien de purge et supprimez les données de test avant la mise en service.
# Configurer le suivi des déclarations

Le suivi reste désactivé tant que Supabase, Upstash Redis et les informations de confidentialité ne sont pas configurés. Ne publiez jamais de clé privée, notamment `service_role`, dans le site, dans GitHub ou dans une conversation.

## 1. Créer la base et le stockage privé

1. Créez un projet Supabase et gardez son URL et ses clés dans un gestionnaire sécurisé.
2. Dans **SQL Editor**, exécutez le contenu de [`schema.sql`](./schema.sql).
   Si le schéma a déjà été installé, exécutez aussi les migrations [`20261028_add_terminus_guediawaye.sql`](./migrations/20261028_add_terminus_guediawaye.sql) et [`20261028_add_lost_time_slot.sql`](./migrations/20261028_add_lost_time_slot.sql) pour appliquer les changements correspondants.
3. Vérifiez que le bucket `declaration-photos` existe et qu’il est privé.
4. Dans **Authentication**, créez le compte du personnel qui administrera les déclarations. Désactivez les inscriptions publiques et n’autorisez que les comptes du service.

Le navigateur public n’accède jamais directement aux tables ni au bucket. Les fonctions Vercel utilisent la clé privée côté serveur ; les photos sont consultables à l’aide de liens temporaires après vérification des codes ou de la session du personnel. Upstash Redis applique des limites horaires aux envois, aux consultations et aux actions du personnel ; si sa protection n’est pas disponible, l’API refuse les requêtes.

## 2. Configurer la protection contre les abus

1. Créez une base Redis dans Upstash et activez son API REST en HTTPS.
2. Gardez son URL REST et son jeton privé dans un gestionnaire sécurisé.
3. Vercel limitera notamment les nouvelles déclarations à 5 par heure par adresse IP et les vérifications de suivi à 60 par heure. L’application hache l’adresse pour limiter le stockage des données techniques.

## 3. Définir les informations de confidentialité

Avant d’activer l’enregistrement de données personnelles, faites valider par le responsable du service un avis clair précisant au minimum :

- le responsable du traitement et un moyen de le contacter ;
- les données enregistrées (coordonnées, déclaration et photos facultatives) et leur usage ;
- la durée de conservation (les dossiers actifs et photos sont purgés quotidiennement au bout d’un mois) et ce qui arrive aux sauvegardes ;
- les modalités de demande d’accès, de rectification ou de suppression ;
- l’hébergement du projet Supabase et tout transfert de données éventuel.

Traduisez l’avis en français, anglais et wolof. Ajoutez-le à Vercel sous la variable `DECLARATION_PRIVACY_NOTICES`, au format JSON sur une seule ligne :

```json
{"fr":"Avis français validé par le service","en":"Notice translated and validated by the service","wo":"Xibaar wu sarwiis bi tekki te nangu"}
```

Remplacez les trois exemples par les avis complets et exacts, pas par ce texte d’exemple. Chaque avis doit faire au moins 80 caractères. L’application les affiche avant la case de consentement et ne permet pas l’envoi ou le suivi si l’avis ou la base n’est pas configuré.

## 4. Ajouter les variables Vercel

Dans **Vercel → Project → Settings → Environment Variables**, ajoutez ces variables pour chaque environnement utilisé :

| Variable | Valeur |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | clé publique `anon`/publishable, utilisée uniquement côté serveur pour la connexion du personnel |
| `SUPABASE_SERVICE_ROLE_KEY` | clé privée `service_role`/secret ; uniquement dans les variables serveur Vercel |
| `SUPABASE_ADMIN_EMAIL` | adresse exacte du compte du personnel autorisé |
| `SITE_ORIGIN` | origine exacte du site, par exemple `https://ibrahima-ndiaye.vercel.app` |
| `CRON_SECRET` | secret aléatoire privé utilisé par Vercel Cron pour autoriser la purge quotidienne |
| `UPSTASH_REDIS_REST_URL` | URL HTTPS de l’API REST de votre base Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | jeton privé de l’API REST Upstash |
| `DECLARATION_PRIVACY_NOTICES` | avis validés en JSON comme décrit ci-dessus |

N’ajoutez pas de barre oblique finale à `SITE_ORIGIN`. Après chaque changement de variable, redéployez le projet.

Le fichier [`../vercel.json`](../vercel.json) planifie la purge tous les jours à 02:00 UTC. Configurez `CRON_SECRET` dans les variables serveur de Vercel et vérifiez dans le tableau de bord **Cron Jobs** que le travail s’exécute après le déploiement de production. Il supprime les anciennes photos du bucket privé et les lignes de déclaration (avec leur historique). Les sauvegardes du fournisseur peuvent avoir une durée distincte : indiquez-la dans l’avis de confidentialité après vérification des paramètres de votre projet Supabase.

La purge nécessite uniquement `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`. Elle peut ainsi continuer à supprimer les dossiers arrivés à échéance même si Upstash ou l’avis de confidentialité est temporairement mal configuré. L’envoi et le suivi restent, eux, désactivés tant que toute la configuration n’est pas valide.

## 5. Vérifier avant ouverture au public

- Ouvrez le site déployé : les boutons de suivi restent désactivés tant que l’API ne confirme pas la configuration.
- Créez un dossier de test, conservez les deux codes, puis consultez-le dans la rubrique **Suivre une déclaration**.
- Connectez-vous sur `/admin.html` avec le compte autorisé, modifiez le statut et vérifiez que le client voit l’historique.
- Testez les deux photos, les codes erronés, le refus du consentement et les comptes de personnel non autorisés.
- Vérifiez les journaux Vercel du travail quotidien de purge et supprimez les données de test avant la mise en service.
