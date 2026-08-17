import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";

import {
  err,
  failure,
  ok,
  type Failure,
  type JournalEntry,
  type PersistencePort,
  type Result,
  type SessionMeta,
  type SessionSnapshot,
  type TurnPersistenceUnit,
} from "@rpengineext/contracts";

import {
  deserializeJournalEntry,
  deserializeSnapshot,
  serializeJournalEntry,
  serializeSnapshot,
  toSessionMeta,
} from "./mappers.ts";
import { resolveDatabaseFile } from "./paths.ts";
import { PRAGMA_WAL_SQL, SCHEMA_SQL } from "./schema.ts";

/**
 * Options for {@link SqlitePersistence}.
 */
export interface SqlitePersistenceOptions {
  /** Absolute or relative path to the `.sqlite` file, or `:memory:`. */
  readonly databaseFile: string;
  /** When true (default for file DBs), enable WAL journal mode. */
  readonly wal?: boolean;
}

type SessionRow = {
  snapshot_json: string;
};

type JournalRow = {
  entry_json: string;
};

/**
 * bun:sqlite implementation of {@link PersistencePort}.
 *
 * Turn commits use a single SQLite transaction via {@link commitTurn}.
 */
export class SqlitePersistence implements PersistencePort {
  readonly databaseFile: string;
  private readonly db: Database;

  /**
   * @param options - database path options
   */
  constructor(options: SqlitePersistenceOptions) {
    this.databaseFile = options.databaseFile;
    this.db = new Database(options.databaseFile, { create: true });
    this.db.exec(SCHEMA_SQL);
    if (options.wal !== false && options.databaseFile !== ":memory:") {
      try {
        this.db.exec(PRAGMA_WAL_SQL);
      } catch {
        // WAL may be unavailable on some FS; ignore and keep default journal.
      }
    }
  }

  /**
   * Opens a persistence driver under a data directory.
   *
   * @param options - dataDir and optional explicit database file
   */
  static async open(options: {
    readonly dataDir: string;
    readonly databaseFile?: string;
    readonly wal?: boolean;
  }): Promise<SqlitePersistence> {
    const databaseFile =
      options.databaseFile === ":memory:"
        ? ":memory:"
        : resolveDatabaseFile({
            dataDir: options.dataDir,
            databaseFile: options.databaseFile,
          });
    if (databaseFile !== ":memory:") {
      await mkdir(path.dirname(databaseFile), { recursive: true });
    }
    return new SqlitePersistence({
      databaseFile,
      wal: options.wal,
    });
  }

  /**
   * @inheritdoc
   */
  async save(snapshot: SessionSnapshot): Promise<Result<void, Failure>> {
    try {
      this.upsertSession(snapshot);
      return ok(undefined);
    } catch (error) {
      return err(toPersistenceFailure("failed to save snapshot", error));
    }
  }

  /**
   * @inheritdoc
   */
  async load(
    sessionId: string,
  ): Promise<Result<SessionSnapshot | null, Failure>> {
    try {
      const row = this.db
        .query<SessionRow, [string]>(
          `SELECT snapshot_json FROM sessions WHERE session_id = ?`,
        )
        .get(sessionId);
      if (!row) {
        return ok(null);
      }
      return ok(deserializeSnapshot(row.snapshot_json));
    } catch (error) {
      return err(toPersistenceFailure("failed to load snapshot", error));
    }
  }

  /**
   * @inheritdoc
   */
  async appendJournal(
    sessionId: string,
    entries: readonly JournalEntry[],
  ): Promise<Result<void, Failure>> {
    try {
      const exists = this.db
        .query<{ session_id: string }, [string]>(
          `SELECT session_id FROM sessions WHERE session_id = ?`,
        )
        .get(sessionId);
      if (!exists) {
        return err(
          failure(
            "PERSISTENCE_FAILED",
            `cannot append journal: session not found: ${sessionId}`,
          ),
        );
      }
      const insert = this.db.transaction((items: readonly JournalEntry[]) => {
        for (const entry of items) {
          this.insertJournalEntry(sessionId, entry);
        }
      });
      insert(entries);
      return ok(undefined);
    } catch (error) {
      return err(toPersistenceFailure("failed to append journal", error));
    }
  }

  /**
   * @inheritdoc
   */
  async readJournal(
    sessionId: string,
    fromRevision?: number,
  ): Promise<Result<JournalEntry[], Failure>> {
    try {
      const rows =
        fromRevision === undefined
          ? this.db
              .query<JournalRow, [string]>(
                `SELECT entry_json FROM journal
                 WHERE session_id = ?
                 ORDER BY next_revision ASC, id ASC`,
              )
              .all(sessionId)
          : this.db
              .query<JournalRow, [string, number]>(
                `SELECT entry_json FROM journal
                 WHERE session_id = ? AND next_revision >= ?
                 ORDER BY next_revision ASC, id ASC`,
              )
              .all(sessionId, fromRevision);
      return ok(rows.map((row) => deserializeJournalEntry(row.entry_json)));
    } catch (error) {
      return err(toPersistenceFailure("failed to read journal", error));
    }
  }

  /**
   * Atomically writes snapshot + journal entries.
   *
   * @param unit - turn persistence unit
   */
  async commitTurn(unit: TurnPersistenceUnit): Promise<Result<void, Failure>> {
    try {
      const sessionId = unit.snapshot.sessionId;
      for (const entry of unit.journalEntries) {
        if (entry.turnId.length === 0) {
          return err(
            failure("PERSISTENCE_FAILED", "journal entry missing turnId"),
          );
        }
      }
      const run = this.db.transaction(() => {
        this.upsertSession(unit.snapshot);
        for (const entry of unit.journalEntries) {
          this.insertJournalEntry(sessionId, entry);
        }
      });
      run();
      return ok(undefined);
    } catch (error) {
      return err(toPersistenceFailure("failed to commit turn unit", error));
    }
  }

  /**
   * @inheritdoc
   */
  async delete(sessionId: string): Promise<Result<void, Failure>> {
    try {
      const run = this.db.transaction(() => {
        this.db
          .query(`DELETE FROM journal WHERE session_id = ?`)
          .run(sessionId);
        this.db
          .query(`DELETE FROM sessions WHERE session_id = ?`)
          .run(sessionId);
      });
      run();
      return ok(undefined);
    } catch (error) {
      return err(toPersistenceFailure("failed to delete session", error));
    }
  }

  /**
   * @inheritdoc
   */
  async list(): Promise<Result<SessionMeta[], Failure>> {
    try {
      const rows = this.db
        .query<SessionRow, []>(
          `SELECT snapshot_json FROM sessions ORDER BY updated_at DESC`,
        )
        .all();
      const metas = rows.map((row) =>
        toSessionMeta(deserializeSnapshot(row.snapshot_json)),
      );
      return ok(metas);
    } catch (error) {
      return err(toPersistenceFailure("failed to list sessions", error));
    }
  }

  /**
   * Closes the underlying database connection.
   */
  close(): void {
    this.db.close();
  }

  private upsertSession(snapshot: SessionSnapshot): void {
    const snapshotJson = serializeSnapshot(snapshot);
    const metaJson =
      snapshot.meta === undefined ? null : JSON.stringify(snapshot.meta);
    this.db
      .query(
        `INSERT INTO sessions (
           session_id, created_at, updated_at, format_version,
           core_version, contracts_version, last_passage_id,
           snapshot_json, meta_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           format_version = excluded.format_version,
           core_version = excluded.core_version,
           contracts_version = excluded.contracts_version,
           last_passage_id = excluded.last_passage_id,
           snapshot_json = excluded.snapshot_json,
           meta_json = excluded.meta_json`,
      )
      .run(
        snapshot.sessionId,
        snapshot.createdAt,
        snapshot.updatedAt,
        snapshot.formatVersion,
        snapshot.engine.coreVersion,
        snapshot.engine.contractsVersion,
        snapshot.lastPassageId ?? null,
        snapshotJson,
        metaJson,
      );
  }

  private insertJournalEntry(sessionId: string, entry: JournalEntry): void {
    this.db
      .query(
        `INSERT INTO journal (
           session_id, turn_id, prev_revision, next_revision,
           passage_id, timestamp, entry_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        entry.turnId,
        entry.prevRevision,
        entry.nextRevision,
        entry.passageId,
        entry.timestamp,
        serializeJournalEntry(entry),
      );
  }
}

function toPersistenceFailure(message: string, error: unknown): Failure {
  return failure("PERSISTENCE_FAILED", message, {
    details: String(error),
  });
}
