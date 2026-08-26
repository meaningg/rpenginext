import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import { ok } from "@rpengineext/contracts";
import {
  expectCommitted,
  expectSlice,
  scriptedToolLlm,
  testModule,
  testModules,
  type ToolScriptStep,
} from "@rpengineext/module-sdk/test";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";

import {
  createSummaryModule,
  SLICE_NAME,
  TOOL_IDS,
} from "../src/index.ts";
import {
  STORE_SUMMARY_TOOL_PARAMETERS,
  type SummarySlice,
} from "../src/schema.ts";

interface ScriptedLlm {
  readonly llm: LlmPort;
  readonly narrativeRequests: LlmCompletionRequest[];
  readonly summaryRequests: LlmCompletionRequest[];
  failSummary: boolean;
}

/**
 * Scripted LLM: narrative.write returns fixed prose via scriptedToolLlm; each
 * summary.make background task runs its own scripted tool loop (summary.store
 * tool call → final {stored:true} JSON). The script queue hands out exactly one
 * step per task, because the scripted mock consumes one step per completion
 * and the post-tool round of task N would otherwise consume task N+1's step.
 * When failSummary is true, the summary task returns non-JSON (task failure)
 * without consuming a script step, so the retry on the next turn still works.
 */
function createScriptedLlm(script: readonly ToolScriptStep[]): ScriptedLlm {
  const narrativeRequests: LlmCompletionRequest[] = [];
  const summaryRequests: LlmCompletionRequest[] = [];
  const queue = [...script];
  let failSummary = false;

  // narrative.write never exposes tools → single fixed-prose instance.
  const narrative = scriptedToolLlm(
    [],
    JSON.stringify({ stored: true }),
    "Narrative prose continues.",
  );
  // Current summary.make task: one scripted tool step, then final JSON.
  let task: LlmPort = scriptedToolLlm([], JSON.stringify({ stored: true }));

  const llm: LlmPort = {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      const isSummary = (request.tools?.length ?? 0) > 0;
      if (!isSummary) {
        narrativeRequests.push(request);
        return narrative.complete(request);
      }
      summaryRequests.push(request);
      if (failSummary) {
        return ok({ text: "this is definitely not json" });
      }
      // Round 1 of a new task (no tool result fed back yet) → next script step.
      const hasToolResult = request.messages.some((m) => m.role === "tool");
      if (!hasToolResult) {
        const step = queue.shift();
        task = scriptedToolLlm(
          step ? [step] : [],
          JSON.stringify({ stored: true }),
        );
      }
      return task.complete(request);
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

function lastNarrativeSystem(requests: readonly LlmCompletionRequest[]): string {
  const req = requests[requests.length - 1];
  const system = req?.messages.find((m) => m.role === "system");
  return typeof system?.content === "string" ? system.content : "";
}

describe("summary module integration", () => {
  test("success: delta chunks every interval, all injected into narrative prompt", async () => {
    const script = createScriptedLlm([
      {
        tool: TOOL_IDS.store,
        args: { summary: "Chunk covers pairs 1..2" },
        result: { ok: true, index: 1, fromPairIndex: 1, toPairIndex: 2 },
      },
      {
        tool: TOOL_IDS.store,
        args: { summary: "Chunk covers pairs 3..4" },
        result: { ok: true, index: 2, fromPairIndex: 3, toPairIndex: 4 },
      },
    ]);
    const h = await testModules(
      [
        createWorkingMemoryModule({ windowPairs: 12 }),
        createSummaryModule({ intervalTurns: 2 }),
      ],
      { llm: script.llm, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    // Turn 1: not due (1 < 2). Turn 2: due → background summary for pairs 1..2.
    for (const text of ["I enter the tavern", "I order a drink"]) {
      expectCommitted(await h.value.turn(text));
    }
    const idle1 = await h.value.waitIdle(5_000);
    expect(idle1.ok).toBe(true);

    const summaryRequest = script.summaryRequests[0];
    expect(script.summaryRequests.length).toBeGreaterThan(0);
    expect(summaryRequest?.tools).toHaveLength(1);
    expect(summaryRequest?.tools?.[0]?.name).toBe(TOOL_IDS.store);
    expect(summaryRequest?.tools?.[0]?.parameters).toEqual(
      STORE_SUMMARY_TOOL_PARAMETERS,
    );

    const slice1 = h.value.sliceOf<SummarySlice>(SLICE_NAME);
    expect(slice1?.lastSummarizedPairCount).toBe(2);
    expect(slice1?.summaries.length).toBe(1);
    expect(slice1?.summaries[0]).toMatchObject({
      index: 1,
      fromPairIndex: 1,
      toPairIndex: 2,
    });
    expect(slice1?.summaries[0]?.text).toContain("covers pairs 1..2");

    // Turn 3: not due (3 < 4) → narrative already sees chunk #1.
    expectCommitted(await h.value.turn("I look around"));
    const sys1 = lastNarrativeSystem(script.narrativeRequests);
    expect(sys1).toContain("STORY SUMMARY");
    expect(sys1).toContain("[1] turns #1–#2");
    expect(sys1).toContain("covers pairs 1..2");

    // Turn 4: due → second chunk for pairs 3..4.
    expectCommitted(await h.value.turn("I pay the bill"));
    const idle2 = await h.value.waitIdle(5_000);
    expect(idle2.ok).toBe(true);
    const slice2 = h.value.sliceOf<SummarySlice>(SLICE_NAME);
    expect(slice2?.summaries.length).toBe(2);
    expect(slice2?.summaries[1]).toMatchObject({
      index: 2,
      fromPairIndex: 3,
      toPairIndex: 4,
    });

    // Turn 5: narrative sees BOTH chunks (all summaries, chronological).
    expectCommitted(await h.value.turn("I leave"));
    const sys2 = lastNarrativeSystem(script.narrativeRequests);
    expect(sys2).toContain("[1] turns #1–#2");
    expect(sys2).toContain("[2] turns #3–#4");
    expect(sys2).toContain("covers pairs 3..4");
  });

  test("error: summary task failure is tolerated and retried on the next turn", async () => {
    const script = createScriptedLlm([
      {
        tool: TOOL_IDS.store,
        args: { summary: "Chunk covers pairs 1..3" },
        result: { ok: true, index: 1, fromPairIndex: 1, toPairIndex: 3 },
      },
    ]);
    script.failSummary = true;
    const h = await testModules(
      [
        createWorkingMemoryModule({ windowPairs: 12 }),
        createSummaryModule({ intervalTurns: 2 }),
      ],
      { llm: script.llm, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    for (const text of ["First", "Second"]) {
      expectCommitted(await h.value.turn(text));
    }
    const idle1 = await h.value.waitIdle(5_000);
    expect(idle1.ok).toBe(true);

    // Task fails → no chunk stored, counter untouched.
    expectSlice(h.value, SLICE_NAME, {
      lastSummarizedPairCount: 0,
      summaries: [],
    });

    // LLM recovers → the next due turn retries and covers pairs 1..3.
    script.failSummary = false;
    const turn3 = await h.value.turn("Third");
    expectCommitted(turn3);

    const idle2 = await h.value.waitIdle(5_000);
    expect(idle2.ok).toBe(true);
    const slice = h.value.sliceOf<SummarySlice>(SLICE_NAME);
    expect(slice?.summaries.length).toBe(1);
    expect(slice?.summaries[0]).toMatchObject({
      index: 1,
      fromPairIndex: 1,
      toPairIndex: 3,
    });
    expect(slice?.summaries[0]?.text).toContain("covers pairs 1..3");
  });

  test("edge: no chunk before the interval, no summary section in the prompt", async () => {
    const script = createScriptedLlm([]);
    const h = await testModules(
      [
        createWorkingMemoryModule({ windowPairs: 12 }),
        createSummaryModule({ intervalTurns: 5 }),
      ],
      { llm: script.llm, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    for (const text of ["One", "Two"]) {
      await h.value.turn(text);
    }
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    expectSlice(h.value, SLICE_NAME, {
      lastSummarizedPairCount: 0,
      summaries: [],
    });
    expect(script.summaryRequests.length).toBe(0);

    await h.value.turn("Three");
    const sys = lastNarrativeSystem(script.narrativeRequests);
    expect(sys).not.toContain("STORY SUMMARY");
  });

  test("edge: no-op when working-memory module is absent", async () => {
    const script = createScriptedLlm([]);
    const h = await testModule(createSummaryModule({ intervalTurns: 2 }), {
      llm: script.llm,
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    for (const text of ["One", "Two"]) {
      const turn = await h.value.turn(text);
      expectCommitted(turn);
    }
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    expectSlice(h.value, SLICE_NAME, {
      lastSummarizedPairCount: 0,
      summaries: [],
    });
    expect(script.summaryRequests.length).toBe(0);
  });
});