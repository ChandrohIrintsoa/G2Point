# G2Point

G2Point est un jeu de stratégie sur grille : pose de points, captures par entourage et territoires confinés. L'application web est une PWA en JavaScript vanilla, sans framework d'exécution.

## Démarrer

- Ouvrir `public/index.html` via un serveur HTTP local ou Firebase Hosting.
- Installer les dépendances de développement : `npm install`.
- Lancer les tests moteur : `npm test`.
- Lancer le tournoi IA reproductible : `npm run bench`.

Le moteur pur est dans `public/js/engine.js`. L'interface, la persistance locale, les modes en ligne et l'apprentissage sont dans `public/js/app.js`. Les positions de puzzle sont dans `public/js/puzzles.js`. Le Worker Cloudflare et son schéma D1 sont sous `cloudflare/`.

## Tests

Les tests Node couvrent les règles, les invariants de l'IA, le hash incrémental, la planification Dijkstra/A* et le filtrage de la mémoire partagée. Les règles Firestore sont vérifiées via l'émulateur dans GitHub Actions.

## Mesure de la force de l'IA

`npm run bench` joue chaque niveau contre les autres sur des graines déterministes et écrit `bench/results.json`. Paramètres :

- `G2_BENCH_GAMES=100` : parties par confrontation (défaut : 10).
- `G2_BENCH_MAX_TURNS=120` : plafond de coups par partie (défaut : 120).

Le workflow **Benchmark IA G2Point** peut être lancé manuellement ou s'exécute chaque semaine. Il publie le JSON comme artefact GitHub Actions. Les mesures sont informatives : elles ne garantissent pas à elles seules un pourcentage de victoire cible.

## Services

- Firebase Hosting / Firestore : hébergement et parties en ligne.
- Cloudflare Workers + D1 : archives validées, progression et mémoire IA partagée.
- Service Worker : cache PWA versionné dans `public/sw.js`.

Les identifiants et paramètres de déploiement restent dans les secrets et fichiers de configuration propres à l'environnement ; ne jamais committer de clés privées.
