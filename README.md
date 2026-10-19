# G2Point

Jeu de points à encercler (2 à 4 joueurs, équipes possibles) jouable dans le navigateur, avec multijoueur en ligne, discussion, IA à quatre niveaux et mode PWA.

## Architecture

| Élément | Rôle | Fichiers |
|---|---|---|
| Jeu (navigateur) | Interface, moteur, IA | `public/` (`js/engine.js` = règles + IA, `js/app.js` = interface) |
| Firebase Hosting | Héberge le site | `firebase.json`, `.firebaserc` |
| Firestore + Auth anonyme | Parties en ligne, salons, discussion | `firebase/firestore.rules` |
| Cloudflare Worker + D1 | Archives, profil, progression, poids de l'IA | `cloudflare/` |
| Entraînement IA | Boucle IA contre IA dans un Web Worker | `public/js/trainer.js`, `public/js/train-worker.js` |

## Installation

```bash
npm ci
npm test            # moteur, IA, entraînement, Worker (les règles Firestore demandent l'émulateur, voir plus bas)
```

## Configuration Firebase

1. Créer le projet, activer **Authentication → Anonyme** et **Firestore**.
2. Renseigner `public/js/firebase-config.js` et `.firebaserc` (modèle : `.firebaserc.example`).
3. Déployer : `npx firebase-tools deploy --only hosting,firestore:rules`.
4. Activer la politique TTL sur `expireAt` (voir `cloudflare/DEPLOIEMENT.md`).

## Tests des règles Firestore

Java 21 requis (émulateur) :

```bash
npx firebase-tools emulators:exec --only firestore --project g2p-test "npm test"
```

La CI (`.github/workflows/test.yml`) le fait pour chaque push sur `main`, `feat/**`, `fix/**` et pour les pull requests. Le déploiement (`main.yml`) ne part que si les tests passent.

## Cloudflare

Voir `cloudflare/DEPLOIEMENT.md` : base D1, secret `IP_SALT`, vérification des jetons Firebase, ordre de déploiement.

## IA

- Niveaux : Facile (hasard dosé), Normal (tactique : ne donne pas de capture, crée menaces et fourchettes), Difficile (recherche avec budget), Champion (recherche + Monte-Carlo).
- `npm run bench` : tournoi entre niveaux (`G2_BENCH_GAMES=100`). Les parties interrompues sont comptées à part.
- `npm run train:sim` : simulation hors navigateur de la boucle d'entraînement.
- Dans le navigateur : l'Observatoire IA (appui long de 15 s sur le résumé de progression) règle l'entraînement continu. Des IA de niveaux différents s'affrontent en boucle ; quand un même participant gagne 100 parties d'affilée, l'entraînement se met en pause X minutes (réglable) puis repart tout seul. Modes : auto (onglet en arrière-plan), toujours actif, arrêté.

## Confidentialité

Voir `PRIVACY.md`.

## Maintenance

- Changer la version des fichiers (`?v=`) dans `public/index.html` **et** `public/sw.js` (nom de cache `g2p-vNN`) à chaque modification du site, pour que la PWA se mette à jour.
- Ne jamais pousser directement sur `main` sans CI verte : un push qui touche `public/`, `firebase/` ou `firebase.json` déclenche le déploiement.
