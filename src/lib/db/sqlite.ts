import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Workspace } from "../domain/types";

// Una base de datos SQLite por espacio de trabajo: "real" y "demo" nunca se mezclan.
// SQLite está integrado en Node >= 22.13 (node:sqlite), sin dependencias nativas.

const SCHEMA_VERSION = 3;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    norm_name TEXT NOT NULL,
    team_id TEXT,
    position TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'desconocido',
    status_note TEXT,
    start_prob REAL,
    value INTEGER,
    source_history TEXT,
    streak_days INTEGER,
    acceleration INTEGER,
    next_opponent_id TEXT,
    next_home INTEGER,
    next_matchday INTEGER,
    points_total INTEGER,
    points_avg REAL,
    points5 INTEGER,
    played5 INTEGER,
    matches_played INTEGER,
    last_points INTEGER,
    source TEXT NOT NULL,
    source_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_players_norm ON players(norm_name, team_id);
  CREATE INDEX IF NOT EXISTS idx_players_source ON players(source, source_id);

  CREATE TABLE IF NOT EXISTS player_overrides (
    user_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    player_id TEXT NOT NULL,
    date TEXT NOT NULL,
    value INTEGER NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (player_id, date)
  );

  CREATE TABLE IF NOT EXISTS squad (
    user_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    purchase_price INTEGER NOT NULL,
    purchase_date TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (user_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    player_id TEXT,
    player_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    cost_basis INTEGER,
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    player_id TEXT NOT NULL,
    asking_price INTEGER,
    seller TEXT,
    UNIQUE (user_id, date, player_id)
  );

  CREATE TABLE IF NOT EXISTS fixtures (
    id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    matchday INTEGER NOT NULL,
    kickoff TEXT,
    date TEXT NOT NULL,
    home_id TEXT NOT NULL,
    away_id TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fixtures_md ON fixtures(matchday);

  CREATE TABLE IF NOT EXISTS probable_lineups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matchday INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    player_id TEXT,
    role TEXT NOT NULL,
    probability REAL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    manual INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_lineups_md ON probable_lineups(matchday, team_id);

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE IF NOT EXISTS squad_value_history (
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    squad_value INTEGER NOT NULL,
    budget INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    kind TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    message TEXT,
    count INTEGER
  );
  `,
  // v2: disciplina (tarjetas y apercibidos)
  `
  ALTER TABLE players ADD COLUMN yellow_cards INTEGER;
  ALTER TABLE players ADD COLUMN red_cards INTEGER;
  ALTER TABLE players ADD COLUMN warned INTEGER;
  `,
  // v3: puntos de cada jugador por jornada (para el once ideal)
  `
  CREATE TABLE IF NOT EXISTS matchday_points (
    matchday INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (matchday, player_id)
  );
  `,
];

type Cache = { dbs: Partial<Record<string, DatabaseSync>> };
const g = globalThis as unknown as { __fosDb?: Cache };
const cache: Cache = (g.__fosDb ??= { dbs: {} });

export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.FOS_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
}

export function dbFile(ws: Workspace): string {
  return path.join(/*turbopackIgnore: true*/ dataDir(), ws === "demo" ? "fantasy-os-demo.db" : "fantasy-os.db");
}

export function openDb(ws: Workspace, file = dbFile(ws)): DatabaseSync {
  const key = file;
  const existing = cache.dbs[key];
  if (existing) return existing;
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  cache.dbs[key] = db;
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  const current = row ? Number(row.value) : 0;
  for (let v = current; v < SCHEMA_VERSION; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(v + 1));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/** Ejecuta fn dentro de una transacción. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Solo para pruebas: cierra y olvida una conexión. */
export function closeDb(file: string) {
  const db = cache.dbs[file];
  if (db) {
    db.close();
    delete cache.dbs[file];
  }
}
