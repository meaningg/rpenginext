import { describe, expect, test } from "bun:test";

import {
  ok,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmPort,
  type Result,
  type Failure,
} from "@rpengineext/contracts";

import { createTestEngine } from "../src/testing/create-test-engine.ts";

class FakeLlmPort implements LlmPort {
  readonly calls: LlmCompletionRequest[] = [];
  constructor(
    private readonly impl: (
      req: LlmCompletionRequest,
    ) => Promise<Result<LlmCompletionResponse, Failure>> | Result<LlmCompletionResponse, Failure>,
  ) {}

  async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletionResponse, Failure>> {
    this.calls.push(request);
    return await this.impl(request);
  }
}

describe("llm narrative path", () => {
  test("narrative.write via LlmPort commits prose", async () => {
    const llm = new FakeLlmPort(() =>
      ok({
        text: JSON.stringify({
          prose: "The lantern flares. A real LLM path writes this line.",
          choiceDrafts: [{ id: "go", label: "Go on", kind: "default", enabled: true }],
        }),
        usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 },
      }),
    );

    const created = await createTestEngine({
      llm,
      agentsMode: "llm",
      defaultModel: "fake-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "look around",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.passage.prose).toContain("lantern");
    expect(llm.calls.length).toBeGreaterThanOrEqual(1);
    expect(llm.calls[0]?.model).toBe("fake-model");
    expect(llm.calls[0]?.responseFormat).toBe("json");
  });

  test("LLM failure rolls back authoritative state", async () => {
    const llm = new FakeLlmPort(async () => ({
      ok: false as const,
      error: {
        code: "LLM_HTTP",
        message: "upstream down",
      },
    }));

    const created = await createTestEngine({
      llm,
      agentsMode: "llm",
      defaultModel: "fake-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { engine, runtime, memoryTraceSink, persistence } = created.value;
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

    const journal = await persistence.readJournal(session.value.sessionId);
    expect(journal.ok).toBe(true);
    if (journal.ok) {
      expect(journal.value).toHaveLength(0);
    }

    const trace = memoryTraceSink.last();
    expect(trace?.markdown).toContain("outcome: **rejected**");
    expect(trace?.markdown).toContain("ROLLBACK");
  });

  test("invalid JSON then repair succeeds", async () => {
    let n = 0;
    const llm = new FakeLlmPort(() => {
      n += 1;
      if (n === 1) {
        return ok({ text: "not-json" });
      }
      return ok({
        text: JSON.stringify({
          prose: "Repaired narrative after bad JSON.",
          choiceDrafts: [],
        }),
      });
    });

    const created = await createTestEngine({
      llm,
      agentsMode: "llm",
      defaultModel: "fake-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "retry",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.passage.prose).toContain("Repaired");
    expect(n).toBe(2);
  });
});
