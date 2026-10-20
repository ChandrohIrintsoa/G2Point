CREATE TABLE IF NOT EXISTS game_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  result TEXT NOT NULL,
  moves_json TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  players INTEGER NOT NULL,
  team INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'local',
  ip_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_archives_player ON game_archives(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_archives_ip ON game_archives(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS game_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statistic_key TEXT NOT NULL UNIQUE,
  statistic_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS player_progress (
  player_id TEXT PRIMARY KEY,
  progress_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS player_ai (
  player_id TEXT PRIMARY KEY,
  weights_json TEXT NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Cerveau IA synchronisé entre appareils (version = verrou optimiste).
CREATE TABLE IF NOT EXISTS player_brain (
  player_id TEXT PRIMARY KEY,
  brain_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Liaison d'appareils : uid supplémentaires autorisés pour un playerId, et codes à usage unique (10 min).
CREATE TABLE IF NOT EXISTS player_links (
  player_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_id, uid)
);
CREATE TABLE IF NOT EXISTS link_codes (
  code TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  exp INTEGER NOT NULL
);

-- Identité : un playerId est lié au uid Firebase qui l'a réclamé en premier (voir worker.mjs, gate()).
CREATE TABLE IF NOT EXISTS player_owner (
  player_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Limitation de fréquence atomique : une ligne par clé et fenêtre de temps.
CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  c INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
