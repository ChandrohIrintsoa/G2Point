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
| Mémoire de l'IA (motifs, poids) | Navigateur (`localStorage`), poids dans D1 | Progression de l'IA | Local à l'appareil |
| Statistiques d'usage | Firebase Analytics | Mesure d'audience | Selon les réglages Analytics du projet |

Les messages ne sont pas envoyés à Cloudflare. L'apprentissage collectif de l'IA est désactivé.

## Suppression

- Navigateur : effacer les données du site supprime l'identifiant d'appareil, l'historique et la mémoire de l'IA.
- Serveur : sur demande, supprimer les lignes d'un `playerId` dans D1 :

```bash
npx wrangler d1 execute g2point --remote --config cloudflare/wrangler.toml \
  --command "DELETE FROM game_archives WHERE player_id='<id>'; DELETE FROM player_profiles WHERE player_id='<id>'; DELETE FROM player_progress WHERE player_id='<id>'; DELETE FROM player_ai WHERE player_id='<id>'; DELETE FROM player_owner WHERE player_id='<id>';"
```
