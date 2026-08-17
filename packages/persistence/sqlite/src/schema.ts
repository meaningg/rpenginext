/**
 * SQLite DDL for session snapshots and journal (formatVersion 1).
 */

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  format_version INTEGER NOT NULL,
  core_version TEXT NOT NULL,
  contracts_version TEXT NOT NULL,
  last_passage_id TEXT,
  snapshot_json TEXT NOT NULL,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  prev_revision INTEGER NOT NULL,
  next_revision INTEGER NOT NULL,
  passage_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  UNIQUE (session_id, turn_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS journal_session_rev
  ON journal (session_id, next_revision);
` as const;

export const PRAGMA_WAL_SQL = `PRAGMA journal_mode = WAL;` as const;
