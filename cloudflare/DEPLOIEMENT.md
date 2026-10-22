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

## 4. Déployer le Worker (après le site)

Ordre à respecter : **d'abord Firebase Hosting (étape 6), ensuite le Worker.** Le site envoie un jeton Firebase ; le Worker déployé avec `FIREBASE_PROJECT_ID` le exige. Un ancien site déjà en cache n'enverrait pas de jeton et ses synchronisations seraient refusées (401) jusqu'à son rechargement.


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

## Identité et sécurité des routes

- `FIREBASE_PROJECT_ID` (dans `wrangler.toml`, actuellement `g2ppoint`) active la vérification des jetons Firebase (RS256, clés Google `securetoken`). Les routes `profile`, `progress`, `ai/player` et `archive` exigent alors `Authorization: Bearer <jeton>`.
- Chaque `playerId` est lié au compte Firebase (uid) qui le réclame en premier (table `player_owner`). Un autre compte reçoit `403`.
- Sans `FIREBASE_PROJECT_ID`, le comportement historique (sans identité vérifiée) est conservé : à n'utiliser que pour un test local.
- Limites : corps lu en flux avec plafond (96 Ko archives, 4 à 32 Ko ailleurs) ; compteurs atomiques dans la table `rate_limits` (écritures : 30/min/IP, lectures : 120/min/IP ; archives : 40/h/IP et 20/h/joueur).
- Les tables `player_owner` et `rate_limits` sont ajoutées par `schema.sql` (relancer l'étape 2) ; le Worker les crée aussi à la volée si elles manquent.
- `GET /api/ai` renvoie une mémoire vide : l'apprentissage collectif est **désactivé** (archives non fiables côté mode). L'IA apprend localement, sur chaque appareil.

## Données conservées dans D1

- Archives de parties rejouées par le moteur (résultat recalculé côté serveur, abandons pris en compte)
- Pseudo du joueur
- Progression, ELO, succès et statistiques face-à-face
- Cerveau de l'IA du joueur (poids, population génétique, livres d'ouvertures/motifs, statistiques du tournoi interne) : `player_brain`, une ligne par joueur, ≤ 900 Ko
- Appareils liés (`player_links`) et codes de liaison à usage unique valables 10 min (`link_codes`)
- Lien playerId ↔ compte Firebase (uid anonyme) et compteurs de limitation (expirent seuls)
- Empreinte salée de l'adresse IP (jamais l'IP en clair)

Les messages de discussion ne sont pas envoyés à Cloudflare.

## Routes utilisées

- `POST /api/archive` (jeton requis)
- `GET /api/ai` (public, mémoire vide)
- `GET|PUT /api/profile` (jeton requis)
- `GET|PUT /api/progress` (jeton requis)
- `GET|PUT /api/ai/player` (jeton requis ; ancien format, poids seuls)
- `GET|PUT /api/ai/brain` (jeton requis) : cerveau IA avec verrou optimiste (`base` = version connue ; 409 + état courant si périmée)
- `POST /api/ai/proposal` (jeton requis, 1/heure/joueur) et `GET /api/ai/proposals` (public, anonyme, sans identifiant) : propositions d'IA des joueurs, jugées par l'entraînement central
- `POST /api/link/create` (jeton du propriétaire) et `POST /api/link/redeem` (jeton du nouvel appareil, 10 essais/h/IP) : liaison d'appareils

## Firestore : TTL à activer (une fois)

Le champ `expireAt` ne supprime rien tout seul. Dans la console Firebase → Firestore → TTL, créer une politique sur le champ `expireAt` pour les groupes de collections `games`, `messages` et `lobby`. Les règles refusent déjà les coups et prises de siège sur une partie expirée ; le TTL ne sert qu'à purger les données.

## Moteur d'IA commun (champion)

`public/ai/champion.json` est le moteur d'IA partagé par tous les joueurs (lecture seule, servi avec le site). Il est entraîné par `.github/workflows/champion.yml` (chaque nuit, ou à la demande) via `npm run champion`. Un candidat (mutation, apprentissage par auto-parties, proposition d'un joueur) n'est promu que s'il passe la porte de vérification de `public/js/verify.js` : match contre le champion (≥ 56 %), banque de techniques (`public/ai/suite.json`, pas de régression), matchs contre les anciens champions (`ai/hof.json`). Le workflow pousse une branche `ai/champion-*` (et tente d'ouvrir une pull request) : rien n'est publié tant qu'elle n'est pas fusionnée. Les propositions des joueurs ne sont jamais crues sur parole : elles sont jouées comme n'importe quel candidat. Côté joueur, l'IA personnelle est vérifiée toutes les 30 parties apprises (retour automatique à la dernière version vérifiée en cas de régression).

## Synchronisation de l'IA entre appareils

Chaque appareil garde son propre compte Firebase anonyme ; la liaison par code donne à un autre appareil l'accès au même `playerId`. Les tables sont créées automatiquement au premier appel (`ensureTables`) ; `schema.sql` les documente. Aucune action manuelle n'est requise au déploiement. La fusion (public/js/brain.js) est monotone : livres = entrée la plus expérimentée par position, poids/population = IA la plus expérimentée, compteurs = maximum. Une remise à zéro des séries (epoch) est propagée.

## Limites connues

- Les règles Firestore ne peuvent pas rejouer le moteur de jeu. Elles vérifient le tour, la case libre, la limite de rythme (250 ms), la série de coups consécutifs (16 maximum), l'expiration et la fin prématurée, mais pas qu'une capture a réellement eu lieu. Une autorité serveur complète (Cloud Function qui rejoue les coups) reste la correction définitive.
- La limitation du chat n'existe que côté navigateur : Firestore ne permet pas de limiter proprement la fréquence de création de documents par utilisateur. App Check et une Cloud Function sont les pistes.
