import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLogger } from "@rpengineext/logger";
import { SqlitePersistence } from "@rpengineext/persistence-sqlite";

import { createEngine, createDefaultMockAgentScript, MemoryTraceSink } from "../src/index.ts";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe("sqlite integration with core", () => {
  test("commit + loadSession restores revision and passage", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rp-core-sqlite-"));
    const dbPath = path.join(dir, "test.sqlite");
    const persistence = await SqlitePersistence.open({
      dataDir: dir,
      databaseFile: dbPath,
    });
    cleanups.push(() => {
      persistence.close();
      return rm(dir, { recursive: true, force: true });
    });

    const log = createLogger({ name: "sqlite-int", level: "error", json: true });
    const sink = new MemoryTraceSink();

    const created = await createEngine({
      deps: { log, persistence, traceSink: sink },
      mockAgentScript: createDefaultMockAgentScript(),
      config: {
        agents: { mode: "mock", defaultModel: "" },
        tracing: { directory: path.join(dir, "traces") },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession({
      sessionId: "ses_persist_1",
      seed: "s",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(turn.status).toBe("committed");
    if (turn.status !== "committed") return;
    expect(turn.revision).toBe(1);

    await created.value.engine.stop();

    // Re-open engine on same DB
    const persistence2 = await SqlitePersistence.open({
      dataDir: dir,
      databaseFile: dbPath,
    });
    cleanups.push(() => persistence2.close());

    const created2 = await createEngine({
      deps: { log, persistence: persistence2, traceSink: new MemoryTraceSink() },
      mockAgentScript: createDefaultMockAgentScript(),
      config: {
        agents: { mode: "mock", defaultModel: "" },
        tracing: { enabled: false, directory: path.join(dir, "traces") },
      },
    });
    expect(created2.ok).toBe(true);
    if (!created2.ok) return;

    const loaded = await created2.value.engine.loadSession("ses_persist_1");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const passage = await loaded.value.getPassage();
    expect(passage.ok).toBe(true);
    if (!passage.ok) return;
    expect(passage.value?.prose.toLowerCase()).toContain("hello");

    const state = created2.value.runtime.getSessionState("ses_persist_1");
    expect(state?.meta.revision).toBe(1);
    expect(state?.core.turnIndex).toBe(1);

    await created2.value.engine.stop();
  });
});
