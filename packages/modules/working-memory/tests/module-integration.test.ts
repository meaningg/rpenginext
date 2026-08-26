import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import { err, failure } from "@rpengineext/contracts";
import {
  expectCommitted,
  expectRejected,
  expectSlice,
  fixedProseLlm,
  testModule,
} from "@rpengineext/module-sdk/test";

import {
  COMMAND_TYPES,
  createWorkingMemoryModule,
  SLICE_NAME,
} from "../src/index.ts";

/**
 * Captures every LLM completion and delegates to fixedProseLlm so the
 * narrative.write schema receives valid JSON prose.
 */
function capturingLlm(store: LlmCompletionRequest[]): LlmPort {
  const inner = fixedProseLlm("Story after.");
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      store.push(request);
      return inner.complete(request);
    },
  };
}

describe("working-memory module integration", () => {
  test("appends pair on free_text commit", async () => {
    const h = await testModule(createWorkingMemoryModule({ windowPairs: 3 }), {
      moduleConfig: { working_memory: { windowPairs: 3 } },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("I open the door");
    expectCommitted(turn);

    expect(
      turn.acceptedCommands.some((c) => c.type === COMMAND_TYPES.appendPair),
    ).toBe(true);

    const slice = h.value.sliceOf<{
      entries: { user: string; assistant: string }[];
    }>(SLICE_NAME);
    expect(slice?.entries).toHaveLength(1);
    expect(slice?.entries[0]?.user).toBe("I open the door");
    expect(slice?.entries[0]?.assistant.length).toBeGreaterThan(0);
  });

  test("window N pairs appear as chat history on later turns", async () => {
    const requests: LlmCompletionRequest[] = [];
    const h = await testModule(createWorkingMemoryModule({ windowPairs: 2 }), {
      llm: capturingLlm(requests),
      agentsMode: "llm",
      moduleConfig: { working_memory: { windowPairs: 2 } },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    for (const text of ["one", "two", "three", "four"]) {
      expectCommitted(await h.value.turn(text));
    }

    const slice = h.value.sliceOf<{ entries: unknown[] }>(SLICE_NAME);
    expect(slice?.entries).toHaveLength(4);

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
    const failingLlm: LlmPort = {
      async complete(): Promise<Result<LlmCompletionResponse, Failure>> {
        return err(failure("LLM_DOWN", "down"));
      },
    };
    const h = await testModule(createWorkingMemoryModule({ windowPairs: 4 }), {
      llm: failingLlm,
      agentsMode: "llm",
      moduleConfig: { working_memory: { windowPairs: 4 } },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("should fail");
    expectRejected(turn);

    expectSlice(h.value, SLICE_NAME, { entries: [] });
  });

  test("empty free_text is rejected and does not append pair", async () => {
    const h = await testModule(createWorkingMemoryModule({ windowPairs: 4 }), {
      moduleConfig: { working_memory: { windowPairs: 4 } },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const first = await h.value.turn("start");
    expectCommitted(first);

    const rejected = await h.value.turn("");
    expectRejected(rejected);

    const slice = h.value.sliceOf<{ entries: unknown[] }>(SLICE_NAME);
    // only the successful free_text pair
    expect(slice?.entries).toHaveLength(1);
  });
});