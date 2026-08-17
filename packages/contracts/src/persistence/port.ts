import type { Result, Failure } from "../result.ts";
import type { JournalEntry } from "./journal.ts";
import type { SessionMeta, SessionSnapshot } from "./snapshot.ts";

/**
 * Atomic turn flush unit: snapshot + journal entries in one driver transaction.
 * @see docs/architecture/07-persistence.md
 */
export interface TurnPersistenceUnit {
  readonly snapshot: SessionSnapshot;
  readonly journalEntries: readonly JournalEntry[];
}

/**
 * Persistence boundary known to core. Implementations live outside core.
 * v1 driver: bun:sqlite.
 */
export interface PersistencePort {
  /**
   * Writes a full session snapshot (may run inside a larger turn transaction).
   *
   * @param snapshot - session snapshot
   */
  save(snapshot: SessionSnapshot): Promise<Result<void, Failure>>;

  /**
   * Loads a session snapshot by id.
   *
   * @param sessionId - session id
   */
  load(sessionId: string): Promise<Result<SessionSnapshot | null, Failure>>;

  /**
   * Appends accepted journal entries for a session.
   *
   * @param sessionId - session id
   * @param entries - journal entries
   */
  appendJournal(
    sessionId: string,
    entries: readonly JournalEntry[],
  ): Promise<Result<void, Failure>>;

  /**
   * Reads journal entries optionally from a revision.
   *
   * @param sessionId - session id
   * @param fromRevision - inclusive lower bound on nextRevision/prev chain
   */
  readJournal(
    sessionId: string,
    fromRevision?: number,
  ): Promise<Result<JournalEntry[], Failure>>;

  /**
   * Atomically persists snapshot + journal for a committed turn (preferred for per_turn).
   * SQLite drivers implement this as a single transaction. In-memory may emulate.
   *
   * @param unit - snapshot and journal entries for the turn
   */
  commitTurn?(unit: TurnPersistenceUnit): Promise<Result<void, Failure>>;

  /**
   * Optional delete.
   *
   * @param sessionId - session id
   */
  delete?(sessionId: string): Promise<Result<void, Failure>>;

  /**
   * Optional session listing for host UX.
   *
   * @param filter - opaque host filter
   */
  list?(filter?: unknown): Promise<Result<SessionMeta[], Failure>>;
}

/**
 * Pointer returned to hosts after an explicit save.
 */
export interface SavePointer {
  readonly sessionId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly path?: string;
}
