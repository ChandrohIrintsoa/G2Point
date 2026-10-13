# Déploiement Cloudflare de G2Point

## Ressources

Le projet utilise le Worker `g2point-api` et la base D1 `g2point`. L'identifiant D1 est déjà renseigné dans `wrangler.toml`.

## 1. Installer et connecter Wrangler

Depuis la racine du projet :

```bash
npm install
npx wrangler login
```

## 2. Créer ou vérifier la base D1

La base `g2point` existe déjà dans la configuration du dépôt API. Vérifier dans le tableau de bord Cloudflare que son identifiant correspond à celui de `wrangler.toml`.

Appliquer le schéma sans supprimer les données existantes :

```bash
npx wrangler d1 execute g2point --remote --file=cloudflare/schema.sql --config cloudflare/wrangler.toml
```

Le schéma utilise `CREATE TABLE IF NOT EXISTS` et ne supprime pas les tables existantes.

## 3. Définir le secret anti-abus

```bash
npx wrangler secret put IP_SALT --config cloudflare/wrangler.toml
```

Saisir une longue valeur aléatoire. Ne pas la publier dans GitHub ni dans le code du navigateur.

## 4. Déployer le Worker

```bash
npx wrangler deploy --config cloudflare/wrangler.toml
```

Wrangler affiche l'URL publique du Worker, par exemple `https://g2point-api.<sous-domaine>.workers.dev`.

## 5. Relier le jeu au Worker

Ouvrir `public/js/cloud-config.js` et remplacer la valeur vide par l'URL réellement affichée par Wrangler :

```js
window.G2_CLOUD={url:'https://g2point-api.<sous-domaine>.workers.dev'};
```

Ne pas conserver les chevrons ni le texte d'exemple. Utiliser exactement l'URL fournie par Cloudflare.

## 6. Publier le jeu sur Firebase Hosting

```bash
firebase login
firebase deploy --only hosting
```

L'origine autorisée dans `wrangler.toml` correspond au projet Firebase `g2ppoint`. Si le domaine Hosting est différent, mettre à jour `ALLOWED_ORIGINS`, puis redéployer le Worker.

## Données conservées dans D1

- Archives de parties validées par le moteur du jeu
- Mémoire collective de l'IA
- Pseudo du joueur
- Progression, ELO, succès et statistiques face-à-face
- Paramètres d'entraînement individuel de l'IA

Les messages de discussion ne sont pas envoyés à Cloudflare et ne sont pas enregistrés dans les tables D1.

## Routes utilisées

- `POST /api/archive`
- `GET /api/ai`
- `GET /api/profile?playerId=...`
- `PUT /api/profile`
- `GET /api/progress?playerId=...`
- `PUT /api/progress`
- `GET /api/ai/player?playerId=...`
- `PUT /api/ai/player`

## Limite importante

Les identifiants joueurs utilisés par cette version sont des identifiants aléatoires propres à l'installation du navigateur. Ils permettent la synchronisation entre les sessions de ce même navigateur, mais pas encore une restauration automatique du profil sur un nouvel appareil. Pour cela, il faudra lier les données à un compte Firebase Auth vérifié et faire valider son jeton par le Worker avant d'ouvrir les données d'un compte.
