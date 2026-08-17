import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Database } from "bun:sqlite";
import {
  err,
  failure,
  ok,
  type Failure,
  type Result,
} from "@rpengineext/contracts";

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS player_sessions_player
  ON player_sessions (player_id, updated_at DESC);
`;

export interface HostPlayer {
  readonly playerId: string;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface HostSessionRow {
  readonly sessionId: string;
  readonly playerId: string;
  readonly templateId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePlayerResult {
  readonly player: HostPlayer;
  /** Plain token shown once to the client. */
  readonly token: string;
}

/**
 * Host-side identity and session ownership store (separate from engine sqlite).
 */
export class HostDb {
  private readonly db: Database;
  private readonly tokenSecret: string;

  /**
   * @param databaseFile - path to host sqlite file
   * @param tokenSecret - HMAC/pepper secret for token hashing
   */
  constructor(databaseFile: string, tokenSecret: string) {
    const dir = path.dirname(databaseFile);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(databaseFile, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA_SQL);
    this.tokenSecret = tokenSecret;
  }

  /**
   * Opens host db under data dir.
   *
   * @param dataDir - data directory
   * @param tokenSecret - token pepper
   * @param explicitPath - optional absolute/relative db path
   */
  static open(
    dataDir: string,
    tokenSecret: string,
    explicitPath?: string,
  ): HostDb {
    const file =
      explicitPath?.trim() || path.join(dataDir, "host.sqlite");
    return new HostDb(path.resolve(file), tokenSecret);
  }

  /**
   * Creates a local player and returns plaintext token once.
   *
   * @param displayName - optional display name
   */
  createPlayer(displayName?: string): Result<CreatePlayerResult, Failure> {
    try {
      const playerId = `plr_${randomBytes(12).toString("hex")}`;
      const token = randomBytes(24).toString("base64url");
      const tokenHash = this.hashToken(token);
      const createdAt = new Date().toISOString();
      const name = displayName?.trim() || "Player";
      this.db
        .query(
          `INSERT INTO players (player_id, token_hash, display_name, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(playerId, tokenHash, name, createdAt);
      return ok({
        player: { playerId, displayName: name, createdAt },
        token,
      });
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to create player", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Authenticates player id + token.
   *
   * @param playerId - player id
   * @param token - bearer token
   */
  authenticate(
    playerId: string,
    token: string,
  ): Result<HostPlayer, Failure> {
    try {
      const row = this.db
        .query(
          `SELECT player_id, token_hash, display_name, created_at
           FROM players WHERE player_id = ?`,
        )
        .get(playerId) as
        | {
            player_id: string;
            token_hash: string;
            display_name: string;
            created_at: string;
          }
        | null;
      if (!row) {
        return err(failure("PERMISSION_DENIED", "invalid player credentials"));
      }
      const expected = Buffer.from(row.token_hash, "hex");
      const actual = Buffer.from(this.hashToken(token), "hex");
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        return err(failure("PERMISSION_DENIED", "invalid player credentials"));
      }
      return ok({
        playerId: row.player_id,
        displayName: row.display_name,
        createdAt: row.created_at,
      });
    } catch (error) {
      return err(
        failure("INTERNAL", "player auth failed", { details: String(error) }),
      );
    }
  }

  /**
   * Registers ownership of an engine session.
   */
  bindSession(input: {
    readonly sessionId: string;
    readonly playerId: string;
    readonly templateId: string;
    readonly title: string;
  }): Result<HostSessionRow, Failure> {
    try {
      const now = new Date().toISOString();
      this.db
        .query(
          `INSERT INTO player_sessions
            (session_id, player_id, template_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.sessionId,
          input.playerId,
          input.templateId,
          input.title,
          now,
          now,
        );
      return ok({
        sessionId: input.sessionId,
        playerId: input.playerId,
        templateId: input.templateId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to bind session", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Lists sessions for a player newest first.
   */
  listSessions(playerId: string): Result<HostSessionRow[], Failure> {
    try {
      const rows = this.db
        .query(
          `SELECT session_id, player_id, template_id, title, created_at, updated_at
           FROM player_sessions
           WHERE player_id = ?
           ORDER BY updated_at DESC`,
        )
        .all(playerId) as Array<{
        session_id: string;
        player_id: string;
        template_id: string;
        title: string;
        created_at: string;
        updated_at: string;
      }>;
      return ok(
        rows.map((row) => ({
          sessionId: row.session_id,
          playerId: row.player_id,
          templateId: row.template_id,
          title: row.title,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      );
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to list sessions", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Loads session ownership row.
   */
  getSession(sessionId: string): Result<HostSessionRow | null, Failure> {
    try {
      const row = this.db
        .query(
          `SELECT session_id, player_id, template_id, title, created_at, updated_at
           FROM player_sessions WHERE session_id = ?`,
        )
        .get(sessionId) as
        | {
            session_id: string;
            player_id: string;
            template_id: string;
            title: string;
            created_at: string;
            updated_at: string;
          }
        | null;
      if (!row) return ok(null);
      return ok({
        sessionId: row.session_id,
        playerId: row.player_id,
        templateId: row.template_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to load session ownership", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Touches updated_at for a session.
   */
  touchSession(sessionId: string): Result<void, Failure> {
    try {
      this.db
        .query(
          `UPDATE player_sessions SET updated_at = ? WHERE session_id = ?`,
        )
        .run(new Date().toISOString(), sessionId);
      return ok(undefined);
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to touch session", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Renames a session and bumps updated_at.
   *
   * @param sessionId - session id
   * @param title - new display title
   */
  updateSessionTitle(
    sessionId: string,
    title: string,
  ): Result<HostSessionRow | null, Failure> {
    try {
      const now = new Date().toISOString();
      this.db
        .query(
          `UPDATE player_sessions
           SET title = ?, updated_at = ?
           WHERE session_id = ?`,
        )
        .run(title, now, sessionId);
      return this.getSession(sessionId);
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to rename session", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Removes session ownership row.
   *
   * @param sessionId - session id
   * @returns true when a row was deleted
   */
  deleteSession(sessionId: string): Result<boolean, Failure> {
    try {
      const result = this.db
        .query(`DELETE FROM player_sessions WHERE session_id = ?`)
        .run(sessionId);
      return ok(Number(result.changes) > 0);
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to delete session", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Counts sessions owned by player.
   */
  countSessions(playerId: string): Result<number, Failure> {
    try {
      const row = this.db
        .query(
          `SELECT COUNT(*) AS c FROM player_sessions WHERE player_id = ?`,
        )
        .get(playerId) as { c: number };
      return ok(Number(row.c) || 0);
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to count sessions", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Closes the database.
   */
  close(): void {
    this.db.close();
  }

  private hashToken(token: string): string {
    return createHash("sha256")
      .update(`${this.tokenSecret}:${token}`)
      .digest("hex");
  }
}
