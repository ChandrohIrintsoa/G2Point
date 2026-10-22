# Données et confidentialité

## Ce qui est collecté

| Donnée | Où | Pourquoi | Durée |
|---|---|---|---|
| Identifiant Firebase anonyme (uid) | Firebase Auth, Firestore | Jouer en ligne | Tant que le navigateur conserve la session |
| Pseudo, coups, tours d'une partie en ligne | Firestore `games` | Faire fonctionner la partie | Supprimé par TTL (`expireAt`, 8 jours maximum) |
| Messages de discussion | Firestore `messages` | Discussion pendant la partie | Supprimé par TTL (≈ 1 jour) |
| Annonces de « partie rapide » | Firestore `lobby` | Trouver un adversaire | 2 heures maximum |
| Identifiant d'appareil, pseudo, progression, ELO, succès | Cloudflare D1 | Synchroniser le profil | Jusqu'à suppression (voir ci-dessous) |
| Parties archivées (coups, résultat) | Cloudflare D1 | Statistiques | Jusqu'à suppression |
| Empreinte salée de l'IP | Cloudflare D1 | Limiter les abus | Non liée à l'identité, jamais l'IP en clair |
| Cerveau de l'IA (motifs, poids, stats d'entraînement) | Navigateur (`localStorage`) et Cloudflare D1 (`player_brain`) | Faire évoluer la même IA sur vos appareils liés | Jusqu'à suppression ; visible uniquement du joueur et de ses appareils liés |
| Proposition d'IA (poids, ≤ 300 motifs maîtrisés, nombre de simulations) | Cloudflare D1 (`ai_proposals`) | Alimenter l'entraînement du champion commun ; lecture publique **anonyme** (sans identifiant) | 14 jours, écrasée à chaque nouvelle proposition |
| Appareils liés, codes de liaison | Cloudflare D1 | Lier vos appareils | Codes : 10 min, usage unique |
| Statistiques d'usage | Firebase Analytics | Mesure d'audience | Selon les réglages Analytics du projet |

Les messages ne sont pas envoyés à Cloudflare. L'apprentissage collectif de l'IA est désactivé.

## Suppression

- Navigateur : effacer les données du site supprime l'identifiant d'appareil, l'historique et la mémoire de l'IA.
- Serveur : sur demande, supprimer les lignes d'un `playerId` dans D1 :

```bash
npx wrangler d1 execute g2point --remote --config cloudflare/wrangler.toml \
  --command "DELETE FROM game_archives WHERE player_id='<id>'; DELETE FROM player_profiles WHERE player_id='<id>'; DELETE FROM player_progress WHERE player_id='<id>'; DELETE FROM player_ai WHERE player_id='<id>'; DELETE FROM player_brain WHERE player_id='<id>'; DELETE FROM ai_proposals WHERE player_id='<id>'; DELETE FROM player_links WHERE player_id='<id>'; DELETE FROM link_codes WHERE player_id='<id>'; DELETE FROM player_owner WHERE player_id='<id>';"
```
