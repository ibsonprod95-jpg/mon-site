# Site et espace d’administration TD-SHOP

TD-SHOP doit être déployé comme un site Vercel distinct du site des objets et bagages. Le site et l’administration de la boutique utilisent également un projet Supabase distinct.

## Déployer le site boutique séparément

1. Dans Vercel, importez le dépôt du site existant comme un **nouveau projet** nommé `td-shop` (ne modifiez pas le projet existant des objets et bagages).
2. Dans les paramètres du nouveau projet, définissez **Root Directory** sur `boutique` et laissez le framework en détection automatique ou choisissez **Other**.
3. Le domaine public de la boutique est `https://www.td-shop.store`. La page publique est `/` et l’administration doit être déployée sur `/admin.html`.
4. N’ajoutez pas de secrets du projet bagages aux variables de ce nouveau site.

## Créer et sécuriser le projet boutique

1. Créez un nouveau projet Supabase pour TD-SHOP. Ne réutilisez pas le projet des bagages.
2. Dans **SQL Editor**, exécutez [`schema.sql`](./schema.sql). Il crée les produits et les droits propres à la boutique, configure le stockage public des photos et remplace les anciennes adresses Vercel des photos par le domaine actuel. Tout le monde peut afficher les photos, mais seuls les administrateurs autorisés peuvent en envoyer, modifier ou supprimer. Si le projet existe déjà, réexécutez ce script pour corriger ses adresses de photos.
3. Dans **Authentication → Users**, invitez l’adresse Gmail du propriétaire. Désactivez les inscriptions publiques.
4. Copiez l’URL du projet et sa clé `anon`/publishable publique dans [`config.js`](./config.js). Cette clé est destinée au navigateur ; ne mettez jamais une clé `service_role` ou `secret` dans ce fichier.
5. Autorisez le propriétaire dans **SQL Editor** en exécutant la requête ci-dessous après son invitation. Remplacez l’adresse par celle de son compte :

   ```sql
   insert into public.store_admins (user_id)
   select id from auth.users
   where lower(email) = lower(trim('adresse-du-proprietaire@gmail.com'))
   on conflict (user_id) do nothing;
   ```

6. Dans **Authentication → URL Configuration**, définissez **Site URL** sur `https://www.td-shop.store` et ajoutez `https://www.td-shop.store/admin.html` aux **Redirect URLs**. N’ajoutez pas d’adresse du site objets/bagages.
7. Après déploiement, ouvrez `/admin.html` sur le domaine propre à TD-SHOP, puis utilisez **Mot de passe oublié ?** pour choisir un mot de passe unique. N’utilisez pas le mot de passe précédemment partagé.

Une fois connecté, l’admin permet d’ajouter, modifier, publier/masquer et retirer des produits, ainsi que de gérer prix et stock. Les changements de catalogue sont alors visibles sur le domaine indépendant de la boutique.

## Vérification avant ouverture

- Connectez-vous avec le compte autorisé et vérifiez que le tableau de bord s’affiche.
- Ajoutez ou modifiez un produit, puis vérifiez son prix et son stock sur la page publique.
- Vérifiez qu’un visiteur non connecté ne peut ni modifier le catalogue ni consulter les produits masqués.
- Vérifiez qu’un compte non autorisé ne peut pas ouvrir l’administration.
- Confirmez que l’URL et la clé configurées correspondent bien au projet boutique, et non au projet des bagages.
