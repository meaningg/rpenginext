import {
  JournalEntrySchema,
  SessionSnapshotSchema,
  type JournalEntry,
  type SessionMeta,
  type SessionSnapshot,
} from "@rpengineext/contracts";

/**
 * Serializes a session snapshot to a JSON string for storage.
 *
 * @param snapshot - session snapshot
 */
export function serializeSnapshot(snapshot: SessionSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Parses a stored snapshot JSON blob.
 *
 * @param json - raw JSON text
 */
export function deserializeSnapshot(json: string): SessionSnapshot {
  const raw: unknown = JSON.parse(json);
  const parsed = SessionSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `invalid session snapshot in database: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Serializes a journal entry.
 *
 * @param entry - journal entry
 */
export function serializeJournalEntry(entry: JournalEntry): string {
  return JSON.stringify(entry);
}

/**
 * Parses a stored journal entry JSON blob.
 *
 * @param json - raw JSON text
 */
export function deserializeJournalEntry(json: string): JournalEntry {
  const raw: unknown = JSON.parse(json);
  const parsed = JournalEntrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `invalid journal entry in database: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Builds a session meta row from a snapshot.
 *
 * @param snapshot - session snapshot
 */
export function toSessionMeta(snapshot: SessionSnapshot): SessionMeta {
  return {
    sessionId: snapshot.sessionId,
    updatedAt: snapshot.updatedAt,
    meta: snapshot.meta,
  };
}
