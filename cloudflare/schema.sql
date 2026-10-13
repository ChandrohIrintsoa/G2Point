-- Schéma D1 « g2point ». Les 3 tables étaient vides : on les recrée avec toutes les colonnes nécessaires.
-- Application :  npx wrangler d1 execute g2point --remote --file=cloudflare/schema.sql
DROP TABLE IF EXISTS game_archives;
DROP TABLE IF EXISTS game_statistics;

CREATE TABLE game_archives (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     TEXT    NOT NULL,            -- code de partie en ligne, ou UUID généré par l'appareil
  player_id   TEXT    NOT NULL,            -- identifiant anonyme de l'appareil
  result      TEXT    NOT NULL,            -- win | loss | draw | na (parties à plusieurs sur un même appareil)
  moves_json  TEXT    NOT NULL,            -- [[x,y],...] rejoué et validé par le Worker
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  players     INTEGER NOT NULL,
  team        INTEGER NOT NULL DEFAULT 0,
  mode        TEXT    NOT NULL DEFAULT 'local',
  ip_hash     TEXT,                        -- empreinte salée de l'IP (anti-abus), jamais l'IP elle-même
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (game_id, player_id)              -- une partie n'est comptée qu'une fois par appareil
);
CREATE INDEX idx_archives_player ON game_archives (player_id, created_at);
CREATE INDEX idx_archives_ip     ON game_archives (ip_hash, created_at);

CREATE TABLE game_statistics (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  statistic_key    TEXT NOT NULL UNIQUE,   -- ai_book | ai_games
  statistic_value  TEXT NOT NULL,
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
