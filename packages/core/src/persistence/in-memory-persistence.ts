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

import { deepClone } from "../util/clone.ts";

interface StoredSession {
  snapshot: SessionSnapshot;
  journal: JournalEntry[];
}

/**
 * In-memory PersistencePort for Phase 2 (sqlite arrives in Phase 3).
 */
export class InMemoryPersistence implements PersistencePort {
  private readonly sessions = new Map<string, StoredSession>();

  /**
   * @inheritdoc
   */
  async save(snapshot: SessionSnapshot): Promise<Result<void, Failure>> {
    try {
      const existing = this.sessions.get(snapshot.sessionId);
      this.sessions.set(snapshot.sessionId, {
        snapshot: deepClone(snapshot),
        journal: existing?.journal ? deepClone(existing.journal) : [],
      });
      return ok(undefined);
    } catch (error) {
      return err(
        failure("PERSISTENCE_FAILED", "failed to save snapshot", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * @inheritdoc
   */
  async load(
    sessionId: string,
  ): Promise<Result<SessionSnapshot | null, Failure>> {
    const stored = this.sessions.get(sessionId);
    if (!stored) {
      return ok(null);
    }
    return ok(deepClone(stored.snapshot));
  }

  /**
   * @inheritdoc
   */
  async appendJournal(
    sessionId: string,
    entries: readonly JournalEntry[],
  ): Promise<Result<void, Failure>> {
    const stored = this.sessions.get(sessionId);
    if (!stored) {
      return err(
        failure(
          "PERSISTENCE_FAILED",
          `cannot append journal: session not found: ${sessionId}`,
        ),
      );
    }
    stored.journal.push(...entries.map((entry) => deepClone(entry)));
    return ok(undefined);
  }

  /**
   * @inheritdoc
   */
  async readJournal(
    sessionId: string,
    fromRevision?: number,
  ): Promise<Result<JournalEntry[], Failure>> {
    const stored = this.sessions.get(sessionId);
    if (!stored) {
      return ok([]);
    }
    const all = deepClone(stored.journal);
    if (fromRevision === undefined) {
      return ok(all);
    }
    return ok(all.filter((entry) => entry.nextRevision >= fromRevision));
  }

  /**
   * Emulates atomic turn flush for tests (single map update).
   *
   * @param unit - snapshot + journal entries
   */
  async commitTurn(
    unit: TurnPersistenceUnit,
  ): Promise<Result<void, Failure>> {
    try {
      const existing = this.sessions.get(unit.snapshot.sessionId);
      const journal = existing?.journal ? deepClone(existing.journal) : [];
      journal.push(...unit.journalEntries.map((entry) => deepClone(entry)));
      this.sessions.set(unit.snapshot.sessionId, {
        snapshot: deepClone(unit.snapshot),
        journal,
      });
      return ok(undefined);
    } catch (error) {
      return err(
        failure("PERSISTENCE_FAILED", "failed to commit turn unit", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * @inheritdoc
   */
  async delete(sessionId: string): Promise<Result<void, Failure>> {
    this.sessions.delete(sessionId);
    return ok(undefined);
  }

  /**
   * @inheritdoc
   */
  async list(): Promise<Result<SessionMeta[], Failure>> {
    const metas: SessionMeta[] = [];
    for (const stored of this.sessions.values()) {
      metas.push({
        sessionId: stored.snapshot.sessionId,
        updatedAt: stored.snapshot.updatedAt,
        meta: stored.snapshot.meta,
      });
    }
    return ok(metas);
  }

  /**
   * Test helper: number of stored sessions.
   */
  size(): number {
    return this.sessions.size;
  }
}
