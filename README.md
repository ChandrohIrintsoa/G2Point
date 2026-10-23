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

## IA : contrat, validation et performances

- **Nombre de joueurs.** Le duel et les parties à 2 équipes sont le cas nominal de l'IA. À 3 ou 4 joueurs sans équipes, l'évaluation oppose le joueur à son *rival principal* (celui qui mène), ce qui n'est pas une recherche max-n complète. Dans le jeu, l'IA locale ne joue que des duels. Voir `rival()` dans `public/js/engine.js` et les tests de contrat dans `tests/properties.test.js`.
- **Porte de vérification fermée par défaut** (`public/js/verify.js`). Sans preuve suffisante, le candidat est refusé : trop peu de parties terminées, banque de techniques vide, aucun match terminé contre un ancien champion, ou exception du vérificateur (`safeGate` : `pass:false`, `error:true`). Une exécution dégradée n'est jamais une réussite.
- **Temps de réponse.** Le niveau Champion a un plafond nominal (`HARD_MAX_MS`) : lorsque le budget est dépassé, la recherche et le raffinement restants sont sautés et le meilleur coup déjà évalué est joué. Le README précédent indiquait sur la machine de développement Node (plateau 17×23) un p95 d'environ 0,3 s pour Champion et 0,1 s pour Difficile. Les téléphones modestes n'ont pas été mesurés ; le calcul de l'IA de partie reste dans le fil principal (déplacement dans un Worker : non fait).
- **« MCTS ».** `mctsRefine` est un raffinement de type bandit UCT à la racine avec trajectoires heuristiques courtes, pas un arbre Monte-Carlo complet. Son apport doit être mesuré par `npm run ablation` ; aucune conclusion n'est tirée tant que l'intervalle de confiance contient 0,5.

# Audit critique approfondi des moteurs et de l'efficacité des IA

**Date de l'audit : 23 octobre 2026.** Audit statique du code versionné, principalement `public/js/engine.js`, `trainer.js`, `train-worker.js`, `verify.js`, `brain.js`, `scripts/bench.js`, `scripts/ablation.js` et `scripts/champion.js`. Les conclusions ci-dessous décrivent ce que le code permet d'établir ; elles ne remplacent pas un tournoi complet ni des mesures sur téléphone.

## Verdict général

G2Point dispose d'une IA de jeu hybride raisonnablement construite : heuristiques, recherche tactique, recherche limitée, mémoire de motifs, entraînement par auto-parties et validation avant adoption. Ce n'est **ni un grand modèle de langage ni un réseau neuronal entraîné de bout en bout**. L'essentiel de ses décisions est produit localement en JavaScript, selon des règles et des évaluations numériques. Cette approche évite les appels API et les coûts de génération à chaque coup, mais sa force dépend beaucoup des heuristiques, de la profondeur de recherche et de la qualité des parties d'entraînement.

Les fondations sont prometteuses, mais trois points empêchent de déclarer l'ensemble « très efficace » sans réserve : la prise en charge profonde de 3–4 joueurs, les coûts de calcul dans l'interface, et l'insuffisance de preuves statistiques versionnées sur la supériorité réelle du Champion.

## 1. Critique par moteur

| Moteur | Méthode observée | Points forts | Limites / verdict |
|---|---|---|---|
| **Facile** | Heuristiques simples, bruit aléatoire et faible poids défensif ; pas de recherche profonde | Rapide et accessible aux débutants | Le hasard peut provoquer des erreurs grossières. C'est un niveau de jeu volontairement faible, pas une IA stratégique complète. |
| **Normal** | Évaluation des captures et voisins, mémoire de motifs, examen de menaces et de fourchettes sur un petit nombre de coups candidats | Bon compromis entre lisibilité, rapidité et tactique immédiate | L'horizon tactique reste court ; il peut manquer une menace qui nécessite plusieurs coups de préparation. |
| **Difficile** | Réponse adverse simulée, carte prédictive, recherche en faisceau et cache de transpositions avec budget limité | Explore plusieurs suites de coups et peut éviter des pièges que Normal ne voit pas | Le faisceau écarte des coups qui pourraient être stratégiquement importants ; la recherche n'est pas un minimax exhaustif et le temps dépend de la position et de l'appareil. |
| **Champion** | Recherche plus large/profonde, prédiction puis raffinement UCT à la racine avec rollouts heuristiques courts | Combine plusieurs signaux et peut départager les meilleurs coups tactiques | Le « Monte-Carlo » n'est pas un arbre de recherche complet : seuls les coups racines candidats sont comparés, via des trajectoires courtes. Le gain réel doit être démontré par ablation. |
| **Mémoire et apprentissage local** | Livres de motifs tactiques/stratégiques, profil simplifié de l'adversaire, mutation de poids et parties IA contre IA | Peut réutiliser des expériences sans service externe ; données personnelles inutiles pour apprendre les motifs | L'apprentissage reste peu profond : motifs locaux et catégories stratégiques discrètes. Il ne garantit pas à lui seul une meilleure décision et peut renforcer un biais s'il est évalué sur des parties trop semblables. |
| **Champion partagé** | Fichier `public/ai/champion.json`, propositions de joueurs, auto-parties et contrôles avant promotion | Les propositions ne sont pas acceptées aveuglément ; déploiement par branche/PR plutôt que publication directe | La qualité dépend de la qualité des contrôles et de la fusion de la PR. Le fichier suivi dans ce dépôt indique un champion initial de référence, pas une preuve suffisante de domination après plusieurs générations. |

## 2. Constats techniques prioritaires

### P0 — La recherche profonde est fragile pour 3–4 joueurs sans équipes

Dans `searchBeam()` et `mctsRefine()`, plusieurs évaluations utilisent `1 - actor` pour désigner l'adversaire. Cela n'est valable que pour un duel ou deux équipes. Quand `actor` vaut 2 ou 3 dans une partie individuelle à 3–4 joueurs, cet indice ne désigne pas un joueur valide ; certains calculs peuvent alors devenir `undefined` / `NaN` et dégrader les classements de coups. Le choix de `rival()` dans d'autres parties du moteur ne corrige pas automatiquement ces calculs.

**Correction conseillée :** choisir et appliquer une politique cohérente à toutes les étapes. Pour 3–4 joueurs individuels, utiliser une évaluation multi-joueurs de type max-n, ou calculer explicitement l'utilité de chaque rival. À défaut, désactiver la recherche profonde pour ces modes et les signaler clairement. Ajouter des tests où les niveaux 0–3 jouent réellement des parties complètes à 2, 3 et 4 joueurs, avec et sans équipes ; les tests actuels de légalité ne suffisent pas à prouver la qualité stratégique de ces modes.

### P1 — Le budget de temps n'est pas une borne dure sur tout le coup

`HARD_MAX_MS` limite les phases coûteuses qui suivent, mais la première génération et notation des candidats parcourt les coups possibles, clone des positions et applique des coups avant certains contrôles de délai. Sur un grand plateau ou un téléphone lent, le budget peut donc être dépassé avant que les garde-fous des phases suivantes ne puissent agir. De plus, le coup normal de l'IA est calculé dans le fil principal du navigateur ; un calcul long peut bloquer temporairement l'interface.

**Correction conseillée :** transmettre une échéance à chaque boucle coûteuse, interrompre proprement le calcul et conserver le meilleur coup légal déjà trouvé. Déplacer aussi le calcul du coup joué vers un Web Worker, pas uniquement les parties d'entraînement. Mesurer les percentiles p50/p95/p99 sur appareils modestes et gros plateaux, puis fixer un budget réaliste.

### P1 — La synchronisation des cerveaux n'est pas toujours commutative

`public/js/brain.js` annonce une fusion commutative et indépendante de l'ordre. Pourtant, quand deux cerveaux ont la même expérience mesurée mais des poids, populations ou états de tournoi différents, `merge()` et `mergeTrain()` privilégient le premier argument en cas d'égalité (`a.games >= b.games`). L'ordre dans lequel deux appareils se synchronisent peut donc changer le résultat. Cela contredit la propriété annoncée et rend les tests d'égalité d'expérience importants.

**Correction conseillée :** définir un départage déterministe indépendant de l'ordre (empreinte canonique, révision/version et identifiant de révision), puis tester `merge(a,b) = merge(b,a)`, l'idempotence `merge(a,a) = a` et l'associativité sur des cerveaux avec le même nombre de parties mais des données différentes. Pour combiner des résultats issus de deux appareils, employer des identifiants d'événements ou des compteurs dédupliqués ; ne pas additionner aveuglément des snapshots qui peuvent représenter les mêmes parties.

### P1 — Le Champion versionné peut être enregistré sans que tous ses paramètres gagnent la fusion

`loadChampion()` déclenche l'adoption si la version distante est plus récente, mais `adoptChampion()` passe ensuite les données dans `G2Brain.merge(local, champ)`. La fusion sélectionne les poids/populations du cerveau jugé le plus expérimenté. Si le cerveau local est considéré plus expérimenté, les poids du Champion distant peuvent ne pas être appliqués, tandis que `champVer` et `champInfo` sont tout de même mis à jour. Le client peut alors mémoriser une version du Champion qu'il n'utilise pas intégralement.

**Correction conseillée :** séparer explicitement deux opérations : (1) enregistrer quelle version publique a été consultée ; (2) décider si ses paramètres remplacent ou complètent le cerveau local. Définir cette politique dans le code et l'interface. Si le Champion doit servir de base commune, appliquer réellement ses paramètres puis fusionner les livres selon une règle déterministe ; si le cerveau local doit rester prioritaire, ne pas prétendre que le moteur complet est passé à la nouvelle version.

### P1 — La validation du Champion doit comparer les moteurs complets

Dans `scripts/champion.js`, les entrées de l'historique (`hof`) sont construites principalement à partir du numéro de version et des poids `w`. La comparaison avec les anciens champions ne semble donc pas préserver toute leur mémoire de motifs (`book`, `sbook`, `antiBook`, `antiSBook`). Une régression liée aux livres appris peut passer inaperçue lors d'un test portant essentiellement sur les poids.

**Correction conseillée :** conserver une version immuable des paramètres complets de chaque Champion testé et l'utiliser dans le hall of fame. Rapporter séparément les résultats contre le Champion courant, chaque ancien Champion et la banque de techniques.

### P2 — Les mesures disponibles ne démontrent pas encore la supériorité du Champion

Le dépôt contient un banc de tournoi (`npm run bench`) et une ablation (`npm run ablation`), ce qui est positif. Néanmoins, le banc de tournoi utilise par défaut seulement 10 parties par paire et une limite de 120 coups ; les parties incomplètes sont exclues du score de victoire, à juste titre, mais doivent rester visibles dans le rapport. L'ablation démarre par défaut à 20 parties et son propre commentaire recommande au moins 100 parties avant de tirer une conclusion. Le test Normal contre Facile utilise lui aussi un petit échantillon de 10 parties : il protège contre certaines régressions majeures, mais ne classe pas précisément les forces.

Les mesures p95 inscrites plus haut concernent Node sur une machine de développement, pas des téléphones. Au moment de cet audit, `ai/last-report.json` indique `version: 1`, `tried: 0`, `promoted: 1`, sans rapports de candidats ; `public/ai/champion.json` identifie cette version comme issue de `baseline` et de 160 auto-parties. Cela décrit une base initiale et ne prouve pas encore que des générations successives ont amélioré le niveau.

**Correction conseillée :** lancer au moins 100–300 parties par comparaison (davantage pour les différences faibles), alterner les sièges, employer plusieurs graines et tailles de plateau, calculer les intervalles de confiance, publier les résultats et le SHA du commit. Ajouter une condition de CI qui exige un échantillon minimal de parties terminées avant toute conclusion. Séparer clairement force de jeu, taux d'interruption et latence.

### P2 — La mémoire apprise est utile, mais elle reste un modèle simplifié

Les clés de stratégie agrègent une position en quelques catégories : phase de partie, pression locale, danger, chaîne de captures et proximité du bord. C'est peu coûteux et interprétable, mais deux situations tactiquement très différentes peuvent partager la même clé. La fusion des livres conserve une entrée par motif plutôt que de recombiner l'ensemble de ses observations ; ce choix évite de compter deux fois des parties synchronisées, mais peut aussi écarter une observation moins fréquente venue d'un autre appareil.

**Correction conseillée :** tester la généralisation sur des parties et graines jamais vues pendant l'apprentissage, suivre les erreurs par type de position, distinguer les parties humaines des parties auto-générées et ne promouvoir que les changements qui améliorent réellement les résultats hors échantillon.

## 3. Points solides à conserver

- Le moteur de règles est séparé de l'interface, testé et doté d'invariants ; le hash incrémental et les tampons réutilisés cherchent à limiter les copies et le travail par coup.
- La génération de candidats évite de considérer systématiquement chaque case éloignée de tout point existant.
- Le vérificateur refuse par défaut les erreurs et les ensembles de preuves insuffisants ; les parties interrompues ne devraient pas être traitées comme des victoires d'entraînement.
- Le travail d'entraînement se déroule dans un Web Worker. Le problème de réactivité concerne surtout la recherche d'un coup pendant une partie et certaines tâches ponctuelles lancées depuis l'interface.
- Le tournoi, les tests de propriétés, le test par techniques, le hall of fame et l'ablation sont de bons outils : il faut renforcer leur couverture et leur échantillonnage plutôt que les supprimer.

## 4. Ordre recommandé des améliorations

1. **Corriger et tester la logique multi-joueurs profonde** : supprimer les hypothèses `1 - actor` hors duel/deux équipes.
2. **Rendre la fusion de cerveaux déterministe et commutative** dans les cas d'égalité, puis régler la cohérence entre version du Champion et paramètres réellement appliqués.
3. **Garantir le budget de temps du début à la fin** du calcul d'un coup et déplacer ce calcul dans un Worker.
4. **Comparer les moteurs complets** dans le hall of fame, y compris les livres appris.
5. **Créer des benchmarks reproductibles versionnés** avec graines, tailles, scores, intervalles de confiance, taux d'interruption et latences sur PC et téléphone.
6. **Renforcer l'évaluation hors échantillon** et ne promouvoir une IA que si le gain est mesuré et reproductible.

## Conclusion

G2Point a une base d'IA locale ambitieuse et adaptée à un jeu de points : plusieurs niveaux, heuristiques interprétables, recherche limitée, apprentissage par motifs et pipeline de validation. Sa principale faiblesse n'est pas l'absence d'un grand modèle, mais l'écart possible entre la complexité du moteur et les preuves que ses décisions sont réellement meilleures. La priorité est de corriger les limites multi-joueurs et de synchronisation, de maîtriser le temps de réponse dans le navigateur, puis de publier des benchmarks reproductibles avant d'affirmer que Champion surpasse systématiquement Difficile.
