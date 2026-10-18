# Sécurité — état actuel

Ce document décrit les garanties réellement appliquées par le code. Il ne constitue pas une certification de sécurité.

## Multijoueur Firestore

Les règles Firestore vérifient notamment l'identité du siège, l'ordre des tours, l'ajout d'un seul coup, l'absence de doublon et un délai minimal. Elles ne rejouent toutefois pas le moteur : elles ne peuvent donc pas vérifier qu'un coup mérite un tour bonus après capture ni qu'une case appartient à un territoire confiné. De plus, la règle `validEnd()` autorise actuellement un joueur assis à terminer une partie sans preuve que le plateau est plein ou que l'adversaire a consenti.

En conséquence, le mode en ligne doit être considéré comme un mode « entre amis », non comme un mode compétitif fiable. Ne l'utilisez pas pour des classements à enjeu, des prix ou des compétitions avant l'ajout d'un arbitre serveur qui rejoue chaque coup avec `public/js/engine.js` et contrôle la fin de partie.

## API Cloudflare

- Le contrôle CORS limite les navigateurs d'autres origines, mais **n'est pas une authentification**.
- Les routes profil, progression et IA individuelle utilisent encore un `playerId` fourni par le client ; elles ne valident pas de jeton Firebase Auth.
- Le mode de partie et l'identifiant de joueur d'une archive sont fournis par le client. Le Worker rejoue les coups et recalcule le résultat du siège 0, mais ces métadonnées ne prouvent pas l'identité du joueur.
- L'apprentissage IA partagé est désactivé. Les archives ne modifient plus le livre global tant que les sources d'apprentissage ne peuvent pas être attribuées à des identités vérifiées et à des parties distinctes.

## Avant une mise en production compétitive

1. Déplacer l'autorité du multijoueur côté serveur : validation des coups, bonus, territoires, abandon et fin naturelle.
2. Vérifier les jetons Firebase Auth dans le Worker et lier chaque donnée cloud à l'UID vérifié.
3. Réactiver l'apprentissage partagé uniquement à partir de données dont l'origine est vérifiée, avec agrégation atomique et anti-abus.
