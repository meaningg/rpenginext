import { describe, expect, test } from "bun:test";

import { createTestEngine } from "../src/testing/create-test-engine.ts";
import { MockAgentScript } from "../src/agents/mock-agent-script.ts";

describe("hello turn integration", () => {
  test("commits hello free_text with mock narrative", async () => {
    const created = await createTestEngine({ includeFixtureHello: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { engine, runtime, memoryTraceSink } = created.value;
    const session = await engine.startSession({ seed: "test-seed" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
      clientActionId: "client_1",
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.passage.prose.toLowerCase()).toContain("hello");
    expect(result.revision).toBe(1);
    expect(result.acceptedCommands.some((c) => c.type === "core.bumpTurn")).toBe(
      true,
    );
    expect(
      result.acceptedCommands.some((c) => c.type === "core.setFlag"),
    ).toBe(true);

    const state = runtime.getSessionState(session.value.sessionId);
    expect(state?.core.turnIndex).toBe(1);
    expect(state?.core.flags.helloSeen).toBe(true);

    const trace = memoryTraceSink.last();
    expect(trace?.markdown).toContain("## Commands");
    expect(trace?.markdown).toContain("outcome: **committed**");
    expect(trace?.markdown).toContain("fixturehello");
  });

  test("idempotent clientActionId returns same result", async () => {
    const created = await createTestEngine();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const a = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
      clientActionId: "same",
    });
    const b = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
      clientActionId: "same",
    });
    expect(a.status).toBe("committed");
    expect(b.status).toBe("committed");
    if (a.status === "committed" && b.status === "committed") {
      expect(a.turnId).toBe(b.turnId);
      expect(a.revision).toBe(b.revision);
    }
  });

  test("agent failure rolls back authoritative state", async () => {
    const script = new MockAgentScript().fail(
      "narrative.write",
      "LLM_DOWN",
      "mock llm down",
    );
    const created = await createTestEngine({ mockAgentScript: script });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { engine, runtime, memoryTraceSink } = created.value;
    const session = await engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const before = runtime.getSessionState(session.value.sessionId);
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.failure.code).toBe("AGENT_FAILED");

    const after = runtime.getSessionState(session.value.sessionId);
    expect(after?.meta.revision).toBe(before?.meta.revision);
    expect(after?.core.turnIndex).toBe(before?.core.turnIndex);

    const trace = memoryTraceSink.last();
    expect(trace?.markdown).toContain("outcome: **rejected**");
    expect(trace?.markdown).toContain("ROLLBACK");
  });

  test("fixture guard rejects nope without state change", async () => {
    const created = await createTestEngine({ includeFixtureHello: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { engine, runtime } = created.value;
    const session = await engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "nope",
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.failure.code).toBe("GUARD_REJECTED");
    expect(runtime.getSessionState(session.value.sessionId)?.core.turnIndex).toBe(
      0,
    );
  });
});
