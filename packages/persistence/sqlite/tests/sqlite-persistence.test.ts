import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createEmptyWorldState,
  type JournalEntry,
  type SessionSnapshot,
} from "@rpengineext/contracts";

import { SqlitePersistence } from "../src/sqlite-persistence.ts";

const opened: SqlitePersistence[] = [];

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
  }
});

function sampleSnapshot(
  sessionId: string,
  revision: number,
  updatedAt: string,
): SessionSnapshot {
  const state = createEmptyWorldState(updatedAt);
  return {
    formatVersion: 1,
    sessionId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    engine: { coreVersion: "0.1.0", contractsVersion: "0.1.0" },
    enabledModules: [],
    state: {
      ...state,
      meta: { ...state.meta, revision },
      core: { ...state.core, turnIndex: revision },
    },
    lastPassageId: revision > 0 ? `pas_${revision}` : undefined,
    passages:
      revision > 0
        ? [
            {
              id: `pas_${revision}`,
              turnId: `trn_${revision}`,
              prose: `Passage ${revision}`,
            },
          ]
        : [],
  };
}

function sampleJournal(
  turnId: string,
  prev: number,
  next: number,
): JournalEntry {
  return {
    turnId,
    prevRevision: prev,
    nextRevision: next,
    input: { kind: "free_text", text: "hello" },
    commands: [],
    passageId: `pas_${next}`,
    timestamp: "2026-01-01T00:00:01.000Z",
  };
}

describe("SqlitePersistence", () => {
  test("commitTurn success roundtrip load + journal", async () => {
    const persistence = new SqlitePersistence({ databaseFile: ":memory:" });
    opened.push(persistence);

    const snapshot = sampleSnapshot("ses_1", 1, "2026-01-01T00:00:01.000Z");
    const entry = sampleJournal("trn_1", 0, 1);

    const committed = await persistence.commitTurn({
      snapshot,
      journalEntries: [entry],
    });
    expect(committed.ok).toBe(true);

    const loaded = await persistence.load("ses_1");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) return;
    expect(loaded.value.state.meta.revision).toBe(1);
    expect(loaded.value.passages?.[0]?.prose).toContain("Passage 1");

    const journal = await persistence.readJournal("ses_1");
    expect(journal.ok).toBe(true);
    if (!journal.ok) return;
    expect(journal.value).toHaveLength(1);
    expect(journal.value[0]?.turnId).toBe("trn_1");
  });

  test("failed mid-transaction leaves previous revision intact", async () => {
    const persistence = new SqlitePersistence({ databaseFile: ":memory:" });
    opened.push(persistence);

    const v1 = sampleSnapshot("ses_2", 1, "2026-01-01T00:00:01.000Z");
    const ok1 = await persistence.commitTurn({
      snapshot: v1,
      journalEntries: [sampleJournal("trn_1", 0, 1)],
    });
    expect(ok1.ok).toBe(true);

    // Force failure: duplicate turn_id unique constraint after snapshot upsert
    // would still roll back the whole TX including the new snapshot.
    const v2 = sampleSnapshot("ses_2", 2, "2026-01-01T00:00:02.000Z");
    const fail = await persistence.commitTurn({
      snapshot: v2,
      journalEntries: [sampleJournal("trn_1", 1, 2)], // same turn_id → UNIQUE fail
    });
    expect(fail.ok).toBe(false);

    const loaded = await persistence.load("ses_2");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) return;
    expect(loaded.value.state.meta.revision).toBe(1);

    const journal = await persistence.readJournal("ses_2");
    expect(journal.ok).toBe(true);
    if (!journal.ok) return;
    expect(journal.value).toHaveLength(1);
  });

  test("readJournal fromRevision filter, list, delete, file open", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rp-sqlite-"));
    try {
      const persistence = await SqlitePersistence.open({ dataDir: dir });
      opened.push(persistence);

      await persistence.commitTurn({
        snapshot: sampleSnapshot("ses_a", 1, "2026-01-01T00:00:01.000Z"),
        journalEntries: [sampleJournal("trn_1", 0, 1)],
      });
      await persistence.commitTurn({
        snapshot: sampleSnapshot("ses_a", 2, "2026-01-01T00:00:02.000Z"),
        journalEntries: [sampleJournal("trn_2", 1, 2)],
      });
      await persistence.save(
        sampleSnapshot("ses_b", 0, "2026-01-01T00:00:03.000Z"),
      );

      const from2 = await persistence.readJournal("ses_a", 2);
      expect(from2.ok).toBe(true);
      if (!from2.ok) return;
      expect(from2.value.map((e) => e.turnId)).toEqual(["trn_2"]);

      const listed = await persistence.list();
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.map((m) => m.sessionId).sort()).toEqual([
        "ses_a",
        "ses_b",
      ]);

      const deleted = await persistence.delete("ses_a");
      expect(deleted.ok).toBe(true);
      const gone = await persistence.load("ses_a");
      expect(gone.ok && gone.value === null).toBe(true);

      const appendMissing = await persistence.appendJournal("missing", [
        sampleJournal("trn_x", 0, 1),
      ]);
      expect(appendMissing.ok).toBe(false);

      // Close before deleting the directory (Windows locks open DB files).
      persistence.close();
      const idx = opened.indexOf(persistence);
      if (idx >= 0) opened.splice(idx, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
