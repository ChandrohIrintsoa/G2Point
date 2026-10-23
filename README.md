# G2Point — Audit critique des moteurs d’IA

**Audit : 23 octobre 2026**  
**Dépôt audité :** [ChandrohIrintsoa/G2Point](https://github.com/ChandrohIrintsoa/G2Point)  
**Périmètre :** moteur de jeu, quatre niveaux d’IA, apprentissage local, entraînement du Champion, validation des candidats, mémoire synchronisée et tests automatisés.

> **Conclusion en une phrase :** G2Point possède une IA locale intéressante et assez bien instrumentée, mais la présence de recherches sophistiquées ne prouve pas que l’IA joue mieux. Les lacunes prioritaires sont la recherche profonde en multi-joueurs, la cohérence de la synchronisation des cerveaux et le manque de résultats de tournoi reproductibles démontrant la supériorité du Champion.

## 1. Tests et niveau de preuve

### Vérifications effectuées

Le dernier workflow de tests exploitable retrouvé est [GitHub Actions — run 39916459479](https://github.com/ChandrohIrintsoa/G2Point/actions/runs/39916459479), associé au commit de code `76d4985950e6ea48411adf2b1779053e913d66c7). Son statut est **success** : installation des dépendances, installation de Java pour l’émulateur Firestore et étape « Exécuter les tests moteur et Firestore » terminées avec succès.

La comparaison entre ce point de contrôle et la tête du dépôt examinée, `59cd36254ef04dad654eb1b10528147244dec997), montre uniquement la suppression de `README.md` et de `PRIVACY.md` ; aucun fichier de moteur ou de test n’a changé entre ces deux révisions. Le résultat CI s’applique donc au code actuellement audité, mais il ne signifie pas que toutes les expériences de force ont été exécutées.

Les tests source examinés comprennent notamment :

- [tests/engine.test.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/tests/engine.test.js) : règles, captures, coups illégaux et comportements tactiques précis.
- [tests/ai.test.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/tests/ai.test.js) : mémoire tactique et stratégique, prédiction, chemins, MCTS/UCT et légalité des coups.
- [tests/properties.test.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/tests/properties.test.js) : invariants après coups aléatoires, nombre de joueurs, équipe et test de latence.
- [tests/brain.test.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/tests/brain.test.js) : fusion des cerveaux, livres d’apprentissage, états du tournoi et progression.
- [tests/slow/champion.test.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/tests/slow/champion.test.js) : seuil de promotion, fichier du Champion et hall of fame.

### Ce que ces tests ne démontrent pas

Aucun fichier `bench/results.json` n’est présent dans la révision consultée. Le rapport enregistré dans [ai/last-report.json](https://github.com/ChandrohIrintsoa/G2Point/blob/main/ai/last-report.json) indique `version: 1`, `tried: 0`, `promoted: 1` et une liste `reports` vide. Le Champion actuellement livré est donc une **base initiale**, issue des poids de référence et de 160 auto-parties, et non le résultat documenté d’une série de candidats ayant démontré leur supériorité.

Je n’ai pas pu relancer une commande Node dans un environnement d’exécution relié au dépôt pendant cet audit. Les conclusions ci-dessous distinguent donc : **test automatisé réussi**, **constat directement vérifiable dans le code** et **question encore non mesurée**. Aucun taux de victoire ou classement de force n’est inventé.

## 2. Les moteurs d’IA

Les quatre niveaux sont définis dans [public/js/engine.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/public/js/engine.js#L41). Le moteur est essentiellement du JavaScript déterministe/heuristique : **ce n’est ni un LLM, ni un réseau neuronal entraîné de bout en bout**. Les parties d’apprentissage font évoluer des poids et des livres de motifs, tandis que l’IA choisit ses coups par calcul local.

| Niveau / composant | Fonctionnement observé | Points forts | Faiblesses et impuissances |
|---|---|---|---|
| **Facile** | Évaluation simple, bruit aléatoire important, pas de recherche profonde | Réponse légère et erreurs compréhensibles ; utile pour débuter | Le bruit peut faire choisir un coup faible même si un meilleur coup est disponible. Il ne vise pas une stratégie fiable à long terme. |
| **Normal** | Heuristiques de capture/blocage, voisinage, mémoire de motifs, menaces et fourchettes sur un petit groupe de candidats | Bon compromis calcul/réactivité ; traite certaines menaces immédiates | Horizon court : peut ignorer une préparation qui ne rapporte qu’après plusieurs coups ou mal apprécier une position globale. |
| **Difficile** | Carte de risque prédictive, réponses adverses, recherche limitée en faisceau et cache de transpositions | Examine davantage de suites possibles qu’un simple score local | La recherche en faisceau coupe des options avant de les explorer profondément. Une mauvaise évaluation au début peut éliminer le bon coup ; la force réelle reste à mesurer. |
| **Champion** | Recherche plus étendue, puis raffinement par un algorithme UCT sur les coups racines | Combine plus de signaux et tente de départager les meilleurs candidats | Le code précise que son « MCTS » n’est **pas** un arbre Monte-Carlo complet : il ne conserve pas un arbre de positions et évalue des trajectoires heuristiques courtes. Un niveau plus complexe peut coûter plus de temps sans gagner plus de parties. |
| **Apprentissage local** | Mutation de six poids, livres tactiques/stratégiques, profil simplifié de l’adversaire et apprentissage sur les parties | Fonctionne sans appel d’API à chaque coup ; mémoire compacte et inspectable | Les motifs sont des abstractions locales. Des positions différentes peuvent partager une clé. L’accumulation d’expériences ne prouve pas une amélioration et peut renforcer des habitudes faibles. |
| **Champion partagé** | `scripts/champion.js`, propositions des joueurs, auto-parties, banque de techniques et filtre de promotion | Les propositions ne sont pas acceptées sans évaluation ; le vérificateur refuse les preuves insuffisantes | Les comparaisons contre les anciens Champions n’utilisent que leurs poids et non toute leur mémoire. Le rapport courant ne documente encore aucun candidat évalué. |

### Ce que l’IA sait faire

- Choisir des coups légaux et rechercher des captures ou des menaces immédiates.
- Utiliser des poids, une mémoire de motifs et un profil adverse limité.
- Prévoir des zones de risque et examiner plusieurs coups candidats.
- Exécuter des auto-parties et refuser un candidat si les contrôles de validation échouent.
- Conserver des tests reproductibles à graine fixe et des invariants du moteur de règles.

### Ce qu’elle ne sait pas garantir

- Que chaque coup choisi est optimal, ou qu’un Champion bat Difficile.
- Une compréhension générale des positions comparable à celle d’un modèle appris sur une grande variété de parties.
- Une stratégie multi-joueurs profonde cohérente dans tous les modes simplement parce que le moteur de règles accepte 2, 3 ou 4 joueurs.
- Un gain de force grâce aux simulations ou aux synchronisations, sans mesures indépendantes sur de nouvelles parties.
- Une latence stable sur tous les téléphones, tailles de plateau et positions de jeu.

## 3. Constats techniques prioritaires

### P1 — Recherche profonde incohérente à 3 ou 4 joueurs individuels

**Constat de code :** dans `searchBeam()` (lignes voisines de 254–256) et `mctsRefine()` (lignes voisines de 290–291), plusieurs calculs supposent que l’adversaire est le joueur `1 - actor`. Cette hypothèse convient à un duel et aux deux équipes, mais pas à une partie individuelle où `actor` vaut 2 ou 3. Dans ces cas, l’accès à `sc[1 - actor]` renvoie `undefined`, ce qui introduit des valeurs `NaN` dans les scores tactiques et fausse le classement des candidats. Le fallback numérique empêche parfois la propagation plus loin, mais ne répare pas le classement initial.

Référence : [recherche et UCT dans engine.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/public/js/engine.js#L242-L310).

**Limite du test actuel :** le contrat IA dans `tests/properties.test.js` vérifie surtout la légalité des coups pour les niveaux 0, 1 et 2 en multi-joueurs ; il ne prouve pas que les évaluations internes sont finies ni que la recherche choisit de bons coups. Le niveau Champion n’y est pas éprouvé en duel individuel à 3 ou 4 joueurs.

**À faire :** soit mettre en œuvre une vraie évaluation multi-joueurs (par exemple de type max-n), soit limiter explicitement les niveaux profonds aux duels/deux équipes. Ajouter un test exigeant des scores intermédiaires finis, puis comparer les résultats de parties à plusieurs joueurs.

### P1 — La fusion des cerveaux n’est pas commutative dans tous les cas limites

Le commentaire de [brain.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/public/js/brain.js) promet une fusion commutative et idempotente. Pourtant, lorsque deux cerveaux ont exactement la même expérience totale, `merge()` choisit le premier argument avec `experience(a) >= experience(b)`. Les poids, la population, le profil adverse et certaines données de tournoi peuvent donc dépendre de l’ordre de synchronisation. Pour les livres, si le nombre de rencontres **et** l’horodatage sont identiques mais que les résultats enregistrés diffèrent, `mergeBook()` garde également la première entrée.

Le test actuel de commutativité dans [brain.test.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/tests/brain.test.js) utilise deux cerveaux dont l’expérience est différente ; il ne couvre pas cette égalité critique. Ce n’est donc pas une contradiction avec le résultat CI : c’est un **cas limite non testé**.

**À faire :** ajouter des tests avec même nombre de parties et simulations, mais poids/livres différents ; comparer `merge(a,b)` et `merge(b,a)`, puis tester l’idempotence et l’associativité. Introduire un départage déterministe indépendant de l’ordre d’entrée.

### P1 — La version du Champion peut avancer sans que ses poids deviennent ceux de l’IA locale

Dans [app.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/public/js/app.js#L344-L364), `adoptChampion()` fusionne le Champion distant avec le cerveau local. Si l’IA locale est considérée comme plus expérimentée, `G2Brain.merge()` peut conserver ses poids. Pourtant, `champVer` et les informations du Champion sont quand même mis à jour. L’application peut ainsi retenir que la nouvelle version du Champion a été adoptée sans utiliser ses poids.

**À faire :** séparer clairement « version publique consultée » et « paramètres actifs ». Définir si les poids du Champion doivent remplacer ceux du joueur ou seulement servir de source à la fusion ; afficher et tester cette politique explicitement.

### P1 — Le hall of fame compare des poids, pas les cerveaux complets

Dans [scripts/champion.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/scripts/champion.js#L60-L98), les anciens Champions sont préparés sous la forme `{w: h.w}`. Le candidat courant, lui, peut inclure `book`, `sbook`, `antiBook` et `antiSBook`. Les matches contre les anciens Champions ne reproduisent donc pas toute leur mémoire. Une régression ou un avantage provenant de ces livres peut être manqué.

**À faire :** stocker des snapshots complets et immuables dans le hall of fame ; comparer la même configuration complète dans chaque duel, avec le même budget et des graines variées.

### P1 — Le plafond de temps ne protège pas chaque étape du calcul

Le moteur définit `HARD_MAX_MS`, mais l’évaluation initiale des candidats et certaines boucles de simulation font du travail avant que les principaux contrôles de délai interviennent. Un dépassement est donc possible avant l’entrée dans les phases de recherche surveillées, et certaines boucles peuvent finir un balayage avant de consulter l’échéance. En outre, l’appel de l’IA de partie se fait dans le fil principal du navigateur : un calcul long peut figer momentanément l’interface.

Le test de latence actuel sur 17×23 vérifie un petit nombre de coups sur une position déjà jouée ; il ne constitue pas une mesure p95/p99 exhaustive du premier coup sur téléphone.

**À faire :** transmettre une échéance à chaque boucle coûteuse, retourner le meilleur coup légal trouvé dès expiration, déplacer aussi la recherche du coup joué vers un Web Worker et mesurer p50/p95/p99 sur téléphone modeste et PC.

### P2 — Les benchmarks ne prouvent pas encore que Champion est plus fort

[bench.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/scripts/bench.js) compare les quatre niveaux, mais il utilise par défaut 10 parties par paire et une limite de 120 coups. [ablation.js](https://github.com/ChandrohIrintsoa/G2Point/blob/main/scripts/ablation.js) démarre par défaut à 20 parties par comparaison et recommande lui-même au moins 100 avant de conclure. Ce sont de bons outils d’orientation, pas un classement définitif avec ces paramètres par défaut.

Aucun résultat de tournoi n’est archivé dans `bench/results.json` dans la version consultée. Le rapport d’entraînement `ai/last-report.json` montre zéro candidat essayé et aucun rapport de match. Il est donc impossible d’affirmer sur la base des artefacts versionnés que Champion surpasse régulièrement Difficile.

**À faire :** lancer 100 à 300 parties par comparaison ou davantage si l’écart est faible, alterner les sièges, diversifier les graines et plateaux, conserver les résultats JSON ainsi que le SHA du code, publier les intervalles de confiance et le taux de parties incomplètes.

### P2 — Les données d’apprentissage sont simplifiées et les progrès peuvent être illusoires

La mémoire stratégique encode notamment la phase de partie, la pression locale, le danger, la chaîne de captures et la proximité du bord. Cette approche est efficace à stocker, mais perd une partie du contexte. La fusion des livres conserve l’entrée jugée la plus expérimentée au lieu de réunir toutes les observations, choix prudent pour éviter le double comptage, mais potentiellement perdant lorsque deux appareils apprennent des expériences distinctes.

**À faire :** évaluer sur des graines et des parties qui n’ont jamais servi à l’apprentissage, séparer les données d’entraînement et d’évaluation, mesurer les résultats par type de position, et n’adopter les évolutions que lorsqu’un avantage hors échantillon est reproductible.

## 4. Points solides à conserver

- Le moteur de règles est séparé de l’interface et dispose de tests de non-régression.
- Des tests de propriétés vérifient les invariants après chaque coup aléatoire, les coups illégaux et plusieurs tailles/nombres de joueurs.
- L’entraînement du Champion comporte une porte de validation qui refuse une erreur ou des preuves insuffisantes.
- Les parties interrompues sont comptabilisées séparément dans le banc de tournoi.
- Le code du moteur documente honnêtement que le raffinement UCT n’est pas un arbre Monte-Carlo complet.
- La mémoire est bornée et nettoyée avant synchronisation, ce qui limite la taille des livres partagés.

## 5. Plan d’amélioration recommandé

1. **Corriger la recherche multi-joueurs** : enlever les hypothèses `1 - actor` des calculs qui doivent fonctionner avec 3–4 joueurs.
2. **Corriger la fusion** : départage déterministe pour les égalités et tests d’ordre, d’idempotence et d’associativité.
3. **Clarifier l’adoption du Champion** : la version annoncée doit correspondre aux paramètres réellement actifs.
4. **Renforcer le hall of fame** : stocker et comparer l’ensemble du cerveau, pas uniquement ses poids.
5. **Durcir la latence** : contrôle d’échéance dans chaque boucle, IA de partie dans un Worker et mesures sur appareils réels.
6. **Publier des essais de force reproductibles** : conserver résultats, graines, tailles, sièges, parties incomplètes et intervalles de confiance.

Commandes de vérification recommandées, à exécuter dans un environnement disposant des dépendances du dépôt :

```bash
npm test
G2_BENCH_GAMES=200 npm run bench
G2_ABL_GAMES=200 npm run ablation
```

Ces commandes n’ont pas été exécutées pendant cet audit ; elles sont proposées pour compléter la CI et produire une preuve empirique de force. Après correction des points prioritaires, ajouter des tests de régression spécifiques avant de relancer ces expériences.

## Verdict final

G2Point n’est pas une « IA impuissante » : elle possède de vraies heuristiques tactiques, une recherche limitée, une mémoire et un pipeline d’entraînement. **Sa faiblesse principale est l’écart entre ce que son architecture promet et ce que les tests actuels prouvent.** Le code contient au moins des cas limites concrets dans la recherche multi-joueurs, la fusion à expérience égale et l’adoption du Champion. Le niveau Champion doit être considéré comme une version expérimentale tant que ses gains sur Difficile ne sont pas mesurés et publiés sur un échantillon suffisant.
