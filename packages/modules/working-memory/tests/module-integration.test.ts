import { describe, expect, test } from "bun:test";

import type {
  LlmCompletionRequest,
  LlmMessage,
  LlmPort,
  Result,
  Failure,
  LlmCompletionResponse,
} from "@rpengineext/contracts";
import { ok } from "@rpengineext/contracts";
import {
  createTestEngine,
  MockAgentScript,
} from "@rpengineext/core/testing";

import {
  COMMAND_TYPES,
  createWorkingMemoryModule,
  SLICE_NAME,
} from "../src/index.ts";

function capturingLlm(store: LlmCompletionRequest[]): LlmPort {
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      store.push(request);
      return ok({
        text: JSON.stringify({
          prose: `Story after: ${request.messages.at(-1)?.content?.slice(0, 40) ?? ""}`,
          choiceDrafts: [],
        }),
      });
    },
  };
}

describe("working-memory module integration", () => {
  test("appends pair on free_text commit", async () => {
    const created = await createTestEngine({
      modules: [createWorkingMemoryModule({ windowPairs: 3 })],
      moduleConfig: { working_memory: { windowPairs: 3 } },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "I open the door",
    });
    expect(turn.status).toBe("committed");
    if (turn.status !== "committed") return;

    expect(
      turn.acceptedCommands.some((c) => c.type === COMMAND_TYPES.appendPair),
    ).toBe(true);

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as {
      entries: { user: string; assistant: string }[];
    };
    expect(slice.entries).toHaveLength(1);
    expect(slice.entries[0]?.user).toBe("I open the door");
    expect(slice.entries[0]?.assistant.length).toBeGreaterThan(0);
  });

  test("window N pairs appear as chat history on later turns", async () => {
    const requests: LlmCompletionRequest[] = [];
    const created = await createTestEngine({
      modules: [createWorkingMemoryModule({ windowPairs: 2 })],
      moduleConfig: { working_memory: { windowPairs: 2 } },
      llm: capturingLlm(requests),
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    for (const text of ["one", "two", "three", "four"]) {
      const turn = await session.value.submitAction({
        kind: "free_text",
        text,
      });
      expect(turn.status).toBe("committed");
    }

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as { entries: unknown[] };
    expect(slice.entries).toHaveLength(4);

    // 4 narrative.write calls
    expect(requests.length).toBeGreaterThanOrEqual(4);
    const last = requests[requests.length - 1]!;
    const roles = last.messages.map((m: LlmMessage) => m.role);
    // system + 2 pairs (4) + final user brief = 6
    expect(roles[0]).toBe("system");
    expect(roles.filter((r) => r === "user").length).toBeGreaterThanOrEqual(3);
    expect(roles.filter((r) => r === "assistant").length).toBe(2);

    const historyUsers = last.messages
      .filter((m) => m.role === "user" && !m.content.includes("narrative.write"))
      .map((m) => m.content);
    // window 2 → pairs for turns 3 and 4 are NOT yet in history when writing turn 4;
    // when writing turn 4, history has pairs from turns 1-3, window 2 → pairs 2 and 3
    expect(historyUsers).toContain("two");
    expect(historyUsers).toContain("three");
    expect(historyUsers).not.toContain("one");
  });

  test("agent failure does not append pair", async () => {
    const script = new MockAgentScript().fail(
      "narrative.write",
      "LLM_DOWN",
      "down",
    );
    const created = await createTestEngine({
      modules: [createWorkingMemoryModule({ windowPairs: 4 })],
      moduleConfig: { working_memory: { windowPairs: 4 } },
      mockAgentScript: script,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "should fail",
    });
    expect(turn.status).toBe("rejected");

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as { entries: unknown[] } | undefined;
    expect(slice?.entries ?? []).toHaveLength(0);
  });

  test("choice action does not append pair", async () => {
    const created = await createTestEngine({
      modules: [createWorkingMemoryModule({ windowPairs: 4 })],
      moduleConfig: { working_memory: { windowPairs: 4 } },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    // First free_text so session is healthy
    const first = await session.value.submitAction({
      kind: "free_text",
      text: "start",
    });
    expect(first.status).toBe("committed");

    const choiceTurn = await session.value.submitAction({
      kind: "choice",
      choiceId: "continue",
    });
    // choice may commit with mock narrative
    if (choiceTurn.status === "committed") {
      const state = created.value.runtime.getSessionState(
        session.value.sessionId,
      );
      const slice = state?.slices[SLICE_NAME] as { entries: unknown[] };
      // only the free_text pair
      expect(slice.entries).toHaveLength(1);
    }
  });
});
