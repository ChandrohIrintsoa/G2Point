# G2Point

G2Point est un jeu de points en application web progressive (PWA). Le moteur de règles est partagé entre le navigateur, les tests Node.js et l'API Cloudflare.

## Développement local

Prérequis : Node.js 22 et Java 21 (ce dernier est utilisé par l'émulateur Firestore).

```sh
npm install
npx --yes firebase-tools emulators:exec --only firestore --project g2p-test "npm test"
```

Pour lancer le tournoi de mesure de l'IA :

```sh
npm run bench
```

## Déploiement

Firebase Hosting et les règles Firestore sont configurés dans `firebase.json`. Déploiement manuel :

```sh
npx firebase-tools deploy --only hosting
npx firebase-tools deploy --only firestore:rules
```

L'API Cloudflare et son schéma D1 se trouvent dans `cloudflare/`. Les scripts `cf:deploy` et `cf:schema` du `package.json` supposent que Wrangler est installé et que le compte Cloudflare ainsi que la base D1 sont configurés.

## Sécurité

Les limites de sécurité connues du multijoueur et des API cloud sont décrites dans [SECURITY.md](SECURITY.md). Le multijoueur Firestore ne doit pas être considéré comme un mode compétitif anti-triche tant qu'un arbitre serveur ne rejoue pas et n'autorise pas chaque coup.
