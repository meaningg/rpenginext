import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import { ok } from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";

import {
  createSummaryModule,
  SLICE_NAME,
  TOOL_IDS,
  WORKING_MEMORY_SLICE_NAME,
} from "../src/index.ts";
import type { SummarySlice } from "../src/schema.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ScriptedLlm {
  readonly llm: LlmPort;
  readonly narrativeRequests: LlmCompletionRequest[];
  readonly summaryRequests: LlmCompletionRequest[];
  failSummary: boolean;
}

/**
 * Scripted LLM: narrative.write returns a fixed prose; the summary.make task
 * first calls summary.store (round 1), then returns { stored: true } (round 2).
 * When failSummary is true, the summary task returns non-JSON (task failure).
 */
function createScriptedLlm(): ScriptedLlm {
  const narrativeRequests: LlmCompletionRequest[] = [];
  const summaryRequests: LlmCompletionRequest[] = [];
  let failSummary = false;

  const llm: LlmPort = {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      const isSummary = request.messages.some(
        (m) =>
          typeof m.content === "string" && m.content.includes("summary.make"),
      );
      if (isSummary) {
        summaryRequests.push(request);
        if (failSummary) {
          return ok({ text: "this is definitely not json" });
        }
        const userMsg = request.messages.find(
          (m) =>
            m.role === "user" &&
            typeof m.content === "string" &&
            m.content.includes("taskType"),
        );
        let chunk = { fromPairIndex: 1, toPairIndex: 1 };
        try {
          const input = JSON.parse(String(userMsg?.content ?? "{}"));
          if (input?.chunk?.toPairIndex) chunk = input.chunk;
        } catch {
          // keep default
        }
        const firstRound =
          (request.tools?.length ?? 0) > 0 &&
          !request.messages.some((m) => m.role === "tool");
        if (firstRound) {
          return ok({
            text: "",
            toolCalls: [
              {
                id: "call_summary_store",
                name: TOOL_IDS.store,
                args: {
                  summary: `Chunk covers pairs ${chunk.fromPairIndex}..${chunk.toPairIndex}`,
                },
              },
            ],
            finishReason: "tool_calls",
          });
        }
        return ok({ text: JSON.stringify({ stored: true }) });
      }

      narrativeRequests.push(request);
      return ok({
        text: JSON.stringify({ prose: "Narrative prose continues." }),
      });
    },
  };

  return {
    llm,
    narrativeRequests,
    summaryRequests,
    get failSummary(): boolean {
      return failSummary;
    },
    set failSummary(value: boolean) {
      failSummary = value;
    },
  };
}

async function waitForSummary(
  runtime: {
    getSessionState(sessionId: string): unknown;
  },
  sessionId: string,
  predicate: (slice: SummarySlice) => boolean,
  timeoutMs = 2_000,
): Promise<SummarySlice | null> {
  const deadline = Date.now() + timeoutMs;
  let slice: SummarySlice | null = null;
  while (Date.now() < deadline) {
    const state = runtime.getSessionState(sessionId) as {
      slices?: Record<string, unknown>;
    };
    slice = (state?.slices?.[SLICE_NAME] as SummarySlice | undefined) ?? null;
    if (slice && predicate(slice)) return slice;
    await sleep(25);
  }
  return slice;
}

function lastNarrativeSystem(requests: readonly LlmCompletionRequest[]): string {
  const req = requests[requests.length - 1];
  const system = req?.messages.find((m) => m.role === "system");
  return typeof system?.content === "string" ? system.content : "";
}

function readSummary(
  runtime: {
    getSessionState(sessionId: string): unknown;
  },
  sessionId: string,
): SummarySlice | null {
  const state = runtime.getSessionState(sessionId) as {
    slices?: Record<string, unknown>;
  };
  return (state?.slices?.[SLICE_NAME] as SummarySlice | undefined) ?? null;
}

describe("summary module integration", () => {
  test("success: delta chunks every interval, all injected into narrative prompt", async () => {
    const script = createScriptedLlm();
    const created = await createTestEngine({
      modules: [
        createWorkingMemoryModule({ windowPairs: 12 }),
        createSummaryModule({ intervalTurns: 2 }),
      ],
      llm: script.llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const sessionId = session.value.sessionId;

    // Turn 1: not due (1 < 2). Turn 2: due → background summary for pairs 1..2.
    for (const text of ["I enter the tavern", "I order a drink"]) {
      const turn = await session.value.submitAction({
        kind: "free_text",
        text,
      });
      expect(turn.status).toBe("committed");
    }

    const slice1 = await waitForSummary(
      created.value.runtime,
      sessionId,
      (s) => s.lastSummarizedPairCount === 2,
    );
    expect(slice1).not.toBeNull();
    expect(slice1?.summaries.length).toBe(1);
    expect(slice1?.summaries[0]).toMatchObject({
      index: 1,
      fromPairIndex: 1,
      toPairIndex: 2,
    });
    expect(slice1?.summaries[0]?.text).toContain("covers pairs 1..2");

    // Turn 3: not due (3 < 4) → narrative already sees chunk #1.
    await session.value.submitAction({ kind: "free_text", text: "I look around" });
    const sys1 = lastNarrativeSystem(script.narrativeRequests);
    expect(sys1).toContain("STORY SUMMARY");
    expect(sys1).toContain("[1] turns #1–#2");
    expect(sys1).toContain("covers pairs 1..2");

    // Turn 4: due → second chunk for pairs 3..4.
    await session.value.submitAction({ kind: "free_text", text: "I pay the bill" });
    const slice2 = await waitForSummary(
      created.value.runtime,
      sessionId,
      (s) => s.lastSummarizedPairCount === 4,
    );
    expect(slice2?.summaries.length).toBe(2);
    expect(slice2?.summaries[1]).toMatchObject({
      index: 2,
      fromPairIndex: 3,
      toPairIndex: 4,
    });

    // Turn 5: narrative sees BOTH chunks (all summaries, chronological).
    await session.value.submitAction({ kind: "free_text", text: "I leave" });
    const sys2 = lastNarrativeSystem(script.narrativeRequests);
    expect(sys2).toContain("[1] turns #1–#2");
    expect(sys2).toContain("[2] turns #3–#4");
    expect(sys2).toContain("covers pairs 3..4");
  });

  test("error: summary task failure is tolerated and retried on the next turn", async () => {
    const script = createScriptedLlm();
    script.failSummary = true;
    const created = await createTestEngine({
      modules: [
        createWorkingMemoryModule({ windowPairs: 12 }),
        createSummaryModule({ intervalTurns: 2 }),
      ],
      llm: script.llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const sessionId = session.value.sessionId;

    for (const text of ["First", "Second"]) {
      const turn = await session.value.submitAction({
        kind: "free_text",
        text,
      });
      expect(turn.status).toBe("committed");
    }

    // Task fails → no chunk stored, counter untouched.
    await sleep(200);
    let slice = readSummary(created.value.runtime, sessionId);
    expect(slice?.summaries.length ?? 0).toBe(0);
    expect(slice?.lastSummarizedPairCount ?? 0).toBe(0);

    // LLM recovers → the next due turn retries and covers pairs 1..3.
    script.failSummary = false;
    const turn3 = await session.value.submitAction({
      kind: "free_text",
      text: "Third",
    });
    expect(turn3.status).toBe("committed");

    slice = await waitForSummary(
      created.value.runtime,
      sessionId,
      (s) => s.lastSummarizedPairCount === 3,
    );
    expect(slice?.summaries.length).toBe(1);
    expect(slice?.summaries[0]).toMatchObject({
      index: 1,
      fromPairIndex: 1,
      toPairIndex: 3,
    });
    expect(slice?.summaries[0]?.text).toContain("covers pairs 1..3");
  });

  test("edge: no chunk before the interval, no summary section in the prompt", async () => {
    const script = createScriptedLlm();
    const created = await createTestEngine({
      modules: [
        createWorkingMemoryModule({ windowPairs: 12 }),
        createSummaryModule({ intervalTurns: 5 }),
      ],
      llm: script.llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const sessionId = session.value.sessionId;

    for (const text of ["One", "Two"]) {
      await session.value.submitAction({ kind: "free_text", text });
    }
    await sleep(200);
    const slice = readSummary(created.value.runtime, sessionId);
    expect(slice?.summaries.length ?? 0).toBe(0);
    expect(script.summaryRequests.length).toBe(0);

    await session.value.submitAction({ kind: "free_text", text: "Three" });
    const sys = lastNarrativeSystem(script.narrativeRequests);
    expect(sys).not.toContain("STORY SUMMARY");
  });

  test("edge: no-op when working-memory module is absent", async () => {
    const script = createScriptedLlm();
    const created = await createTestEngine({
      modules: [createSummaryModule({ intervalTurns: 2 })],
      llm: script.llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const sessionId = session.value.sessionId;

    for (const text of ["One", "Two"]) {
      const turn = await session.value.submitAction({
        kind: "free_text",
        text,
      });
      expect(turn.status).toBe("committed");
    }
    await sleep(200);
    const slice = readSummary(created.value.runtime, sessionId);
    expect(slice?.summaries.length ?? 0).toBe(0);
    expect(script.summaryRequests.length).toBe(0);
  });
});
