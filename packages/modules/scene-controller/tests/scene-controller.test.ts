import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";
import {
  expectCommitted,
  expectSlice,
  fixedProseLlm,
  testModules,
  type TestModuleOptions,
} from "@rpengineext/module-sdk/test";

import {
  createSceneControllerModule,
  deriveGuidanceMode,
  SLICE_NAME,
  TOOL_IDS,
} from "../src/index.ts";
import type { SceneControllerSlice, Verdict } from "../src/schema.ts";

/**
 * Verdict override helper (no sourceTurnId noise in tests).
 */
function verdict(partial: Partial<Verdict> = {}): Partial<Verdict> {
  return partial;
}

const DEFAULT_ARGS: Record<string, unknown> = {
  sameScene: false,
  label: null,
  type: null,
  progress: 0.5,
  stall: false,
  repeat: false,
  loop: "none",
  urgency: 0,
  resolved: false,
  resolutionHint: null,
};

/**
 * Deterministic probe LLM: exactly one tool call per scene probe task.
 *
 * - completions without tools (narrative.write) → JSON prose
 * - first tool-carrying completion of a task → next verdict as tool call
 * - follow-up completion after the tool result → final `{"reported": true}`
 * - no verdicts left → final `{"reported": false}` without a tool call
 */
function probeLlm(
  verdicts: readonly Partial<Verdict>[],
  narrativeText = "prose",
): LlmPort {
  let index = 0;
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      const hasTools = (request.tools?.length ?? 0) > 0;
      if (!hasTools) {
        return okJson({ prose: narrativeText });
      }
      const hasToolResult = request.messages.some((m) => m.role === "tool");
      if (hasToolResult) {
        return okJson({ reported: true });
      }
      const step = verdicts[index];
      if (!step) return okJson({ reported: false });
      index += 1;
      return {
        ok: true,
        value: {
          text: "",
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: `call_probe_${index}`,
              name: TOOL_IDS.reportScene,
              args: { ...DEFAULT_ARGS, ...step },
            },
          ],
        },
      };
    },
  };
}

function okJson(
  value: Record<string, unknown>,
): Result<LlmCompletionResponse, Failure> {
  return {
    ok: true,
    value: { text: JSON.stringify(value), finishReason: "stop" },
  };
}

/**
 * Counts narrative.write completions (no tool-carrying requests) among the
 * recorded LLM requests — used to prove a critic-triggered regeneration ran.
 */
function narrativeCalls(requests: readonly LlmCompletionRequest[]): number {
  return requests.filter((r) => (r.tools?.length ?? 0) === 0).length;
}

/**
 * Probe LLM with a scripted narrative queue (critic tests): non-tool
 * completions consume the next narrative text; tool completions consume
 * verdicts like {@link probeLlm}. Every request is recorded for assertions.
 */
function criticLlm(
  verdicts: readonly Partial<Verdict>[],
  narrativeScript: readonly string[],
  requests: LlmCompletionRequest[],
): LlmPort {
  let probeIndex = 0;
  let narrIndex = 0;
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      requests.push(request);
      const hasTools = (request.tools?.length ?? 0) > 0;
      if (!hasTools) {
        const text =
          narrativeScript[Math.min(narrIndex, narrativeScript.length - 1)] ??
          "prose";
        narrIndex += 1;
        return okJson({ prose: text });
      }
      const hasToolResult = request.messages.some((m) => m.role === "tool");
      if (hasToolResult) {
        return okJson({ reported: true });
      }
      const step = verdicts[probeIndex];
      if (!step) return okJson({ reported: false });
      probeIndex += 1;
      return {
        ok: true,
        value: {
          text: "",
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: `call_critic_probe_${probeIndex}`,
              name: TOOL_IDS.reportScene,
              args: { ...DEFAULT_ARGS, ...step },
            },
          ],
        },
      };
    },
  };
}

type BootOptions = Omit<TestModuleOptions, "llm" | "agentsMode">;

/**
 * Boots working-memory + scene-controller with the probe scripted via verdicts.
 */
async function bootWithProbe(
  verdicts: readonly Partial<Verdict>[],
  options: BootOptions = {},
  narrativeText = "prose",
) {
  return testModules(
    [createWorkingMemoryModule(), createSceneControllerModule()],
    {
      ...options,
      llm: probeLlm(verdicts, narrativeText),
      agentsMode: "llm",
    },
  );
}

function sliceOf(h: { sliceOf<T = unknown>(name: string): T | undefined }) {
  return h.sliceOf<SceneControllerSlice>(SLICE_NAME);
}

function wmEntries(
  h: { sliceOf<T = unknown>(name: string): T | undefined },
): unknown[] {
  const wm = h.sliceOf<{ entries: unknown[] }>("working_memory");
  return wm?.entries ?? [];
}

describe("scene-controller lifecycle (working-memory integration)", () => {
  test("success: begin → refresh → resolve with history bookkeeping", async () => {
    const h = await bootWithProbe([
      verdict({
        sameScene: false,
        label: "Разговор в порту",
        type: "social",
        progress: 0.4,
        urgency: 1,
      }),
      verdict({
        sameScene: true,
        progress: 0.7,
        urgency: 2,
        resolutionHint: "капитан называет цену и уходит",
      }),
      verdict({ sameScene: true, progress: 1, urgency: 2, resolved: true }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    // Turn 1: first probe begins the scene; pairs live in working-memory.
    const t1 = await h.value.turn("подхожу к капитану");
    expectCommitted(t1);
    const idle1 = await h.value.waitIdle(5_000);
    expect(idle1.ok).toBe(true);
    expectSlice(h.value, SLICE_NAME, {
      counters: { playerTurns: 1, probes: 1, resolvedScenes: 0, scenes: 1 },
    });
    expect(sliceOf(h.value)?.current).toMatchObject({
      id: "scene-001",
      label: "Разговор в порту",
      type: "social",
      beat: 1,
    });
    // Bookkeeping ids come from the slice (real player turn), not from the model.
    expect(sliceOf(h.value)?.current?.startedAtTurnId).toBe(t1.turnId);
    expect(wmEntries(h.value)).toHaveLength(1);

    // Turn 2: same scene refresh — beat grows, verdict stored.
    const t2 = await h.value.turn("прошу контракт на груз");
    expectCommitted(t2);
    const idle2 = await h.value.waitIdle(5_000);
    expect(idle2.ok).toBe(true);
    expect(sliceOf(h.value)?.current?.beat).toBe(2);
    expect(sliceOf(h.value)?.lastVerdict?.urgency).toBe(2);
    expect(sliceOf(h.value)?.current?.lastConfirmTurnId).toBe(t2.turnId);
    expect(wmEntries(h.value)).toHaveLength(2);

    // Turn 3: resolved — scene closed, history logged.
    const t3 = await h.value.turn("соглашаюсь на условия");
    expectCommitted(t3);
    const idle3 = await h.value.waitIdle(5_000);
    expect(idle3.ok).toBe(true);
    expect(sliceOf(h.value)?.current).toBeNull();
    expect(sliceOf(h.value)?.history).toMatchObject([
      { id: "scene-001", outcome: "resolved", beats: 2, type: "social" },
    ]);
    expectSlice(h.value, SLICE_NAME, {
      counters: { playerTurns: 3, probes: 3, resolvedScenes: 1, scenes: 1 },
    });
  });

  test("critic: hard loop + identical action → turn commits, narration is regenerated (player never denied)", async () => {
    const requests: LlmCompletionRequest[] = [];
    const llm = criticLlm(
      [
        verdict({
          sameScene: false,
          label: "Стычка у ворот",
          type: "conflict",
          loop: "soft",
          urgency: 1,
          stall: true,
        }),
        verdict({
          sameScene: true,
          loop: "hard",
          urgency: 3,
          stall: true,
          progress: 0.3,
        }),
        verdict({
          sameScene: true,
          loop: "hard",
          stall: true,
          progress: 0.3,
        }),
      ],
      ["первый бой", "второй бой", "третий бой", "четвёртый бой"],
      requests,
    );
    const h = await testModules(
      [createWorkingMemoryModule(), createSceneControllerModule()],
      { llm, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("атакую стражу");
    let idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    await h.value.turn("атакую стражу");
    idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    expect(sliceOf(h.value)?.loopLevel).toBe("hard");

    // Identical action in a hard scene: the turn MUST commit (the player is
    // not punished) and the draft is regenerated once by the narrative critic.
    const before = narrativeCalls(requests);
    const t3 = await h.value.turn("атакую стражу");
    expectCommitted(t3);
    expect(t3.passage.prose).toBe("четвёртый бой"); // rewrite landed
    expect(narrativeCalls(requests) - before).toBe(2); // round 0 draft + rewrite

    idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
  });

  test("critic: repair round feeds back the failed draft + conclusion mandate; fresh draft accepted", async () => {
    const requests: LlmCompletionRequest[] = [];
    const llm = criticLlm(
      [
        verdict({
          sameScene: false,
          label: "Стычка у ворот",
          type: "conflict",
          loop: "soft",
          stall: true,
        }),
        verdict({
          sameScene: true,
          loop: "hard",
          urgency: 3,
          stall: true,
          progress: 0.3,
        }),
      ],
      ["бой первый", "бой второй", "повторный бой", "финал: противник отступает"],
      requests,
    );
    const h = await testModules(
      [createWorkingMemoryModule(), createSceneControllerModule()],
      { llm, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("атакую стражу");
    let idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    await h.value.turn("атакую стражу");
    idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    expect(sliceOf(h.value)?.loopLevel).toBe("hard");

    const t3 = await h.value.turn("атакую стражу");
    expectCommitted(t3);
    expect(t3.passage.prose).toBe("финал: противник отступает");

    // The rewrite request carries the failed draft (last assistant message) and
    // the critic's conclusion mandate inside the repair user message.
    const narrative = requests.filter((r) => (r.tools?.length ?? 0) === 0);
    const rewrite = narrative[narrative.length - 1]!;
    const roles = rewrite.messages.map((m) => m.role);
    expect(roles[roles.length - 2]).toBe("assistant");
    expect(String(rewrite.messages[roles.length - 2]!.content)).toContain("повторный бой");
    expect(roles[roles.length - 1]).toBe("user");
    expect(String(rewrite.messages[roles.length - 1]!.content)).toContain(
      "жёстком пределе",
    );
  });

  test("critic: non-hard scenes are written once (no regeneration)", async () => {
    const requests: LlmCompletionRequest[] = [];
    const llm = criticLlm(
      [
        verdict({ sameScene: false, label: "Бар", type: "social", progress: 0.3 }),
        verdict({ sameScene: true, progress: 0.6, urgency: 1 }),
      ],
      ["входишь в бар", "садишься за стойку"],
      requests,
    );
    const h = await testModules(
      [createWorkingMemoryModule(), createSceneControllerModule()],
      { llm, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const t1 = await h.value.turn("захожу в бар");
    expectCommitted(t1);
    let idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    const t2 = await h.value.turn("сажусь за стойку");
    expectCommitted(t2);
    expect(t2.passage.prose).toBe("садишься за стойку");
    idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    expect(narrativeCalls(requests)).toBe(2); // exactly one draft per turn
    expect(sliceOf(h.value)?.loopLevel).toBe("none");
  });

  test("edge: probe disabled → bookkeeping only, no probes", async () => {
    const requests: LlmCompletionRequest[] = [];
    const inner = fixedProseLlm("Тишина.");
    const llm: LlmPort = {
      async complete(
        request: LlmCompletionRequest,
      ): Promise<Result<LlmCompletionResponse, Failure>> {
        requests.push(request);
        return inner.complete(request);
      },
    };
    const h = await testModules(
      [createWorkingMemoryModule(), createSceneControllerModule()],
      {
        llm,
        agentsMode: "llm",
        moduleConfig: { scene_controller: { probeEnabled: false } },
      },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("осматриваюсь");
    expectCommitted(turn);
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    expect(sliceOf(h.value)?.counters).toMatchObject({
      playerTurns: 1,
      probes: 0,
    });
    expect(sliceOf(h.value)?.current).toBeNull();
    expect(wmEntries(h.value)).toHaveLength(1);
    const toolCalls = requests.filter((r) => (r.tools?.length ?? 0) > 0);
    expect(toolCalls).toHaveLength(0);
  });

  test("edge: probe task failure (optional) never breaks the player turn", async () => {
    const failing: LlmPort = {
      async complete(
        request: LlmCompletionRequest,
      ): Promise<Result<LlmCompletionResponse, Failure>> {
        const hasTools = (request.tools?.length ?? 0) > 0;
        return {
          ok: true,
          value: {
            text: hasTools
              ? '{"invalid": true}'
              : JSON.stringify({ prose: "Дверь приоткрыта." }),
            finishReason: "stop",
          },
        };
      },
    };
    const h = await testModules(
      [createWorkingMemoryModule(), createSceneControllerModule()],
      { llm: failing, agentsMode: "llm" },
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("толкаю дверь");
    expectCommitted(turn);
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    // Background task failed (`optional: true`); pairs still land in wm.
    expect(wmEntries(h.value)).toHaveLength(1);
    expect(sliceOf(h.value)?.counters.probes).toBe(0);
    expect(sliceOf(h.value)?.current).toBeNull();
  });

  test("edge: save/load round-trip keeps scene state and history", async () => {
    const h = await bootWithProbe([
      verdict({
        sameScene: false,
        label: "Ночной перекрёсток",
        type: "mystery",
        progress: 0.3,
      }),
      verdict({ sameScene: true, progress: 0.8, urgency: 2 }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("иду к перекрёстку");
    await h.value.waitIdle(5_000);
    await h.value.turn("осматриваю следы");
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    const before = sliceOf(h.value);
    const saved = await h.value.save();
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const loaded = await h.value.load(saved.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(sliceOf(h.value)).toEqual(before);
  });

  test("edge: invalid moduleConfig fails boot loudly", async () => {
    const h = await testModules(
      [createWorkingMemoryModule(), createSceneControllerModule()],
      { moduleConfig: { scene_controller: { historyCap: -7 } } },
    );
    expect(h.ok).toBe(false);
  });

  test("edge: module assigns sequential scene ids — model can't fragment scenes", async () => {
    const h = await bootWithProbe([
      // First scene.
      verdict({ sameScene: false, label: "Бар", type: "social" }),
      // Same scene continues — id must stay stable.
      verdict({ sameScene: true, progress: 0.6 }),
      // Model believes a genuinely new scene began — module increments the id.
      verdict({ sameScene: false, label: "Квартира", type: "downtime" }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("захожу в бар");
    await h.value.waitIdle(5_000);
    expect(sliceOf(h.value)?.current?.id).toBe("scene-001");
    expect(sliceOf(h.value)?.current?.label).toBe("Бар");

    await h.value.turn("сажусь за стойку");
    await h.value.waitIdle(5_000);
    expect(sliceOf(h.value)?.current?.id).toBe("scene-001");
    expect(sliceOf(h.value)?.current?.beat).toBe(2);

    await h.value.turn("иду к дивану");
    await h.value.waitIdle(5_000);
    expect(sliceOf(h.value)?.current).toMatchObject({
      id: "scene-002",
      label: "Квартира",
      beat: 1,
    });
    expect(sliceOf(h.value)?.history).toMatchObject([
      { id: "scene-001", outcome: "transitioned", beats: 2 },
    ]);
  });

  test("edge: soft verdict fields may be omitted by the model", async () => {
    const h = await bootWithProbe([
      // No label/type — module normalizes to empty label / "other".
      {
        sameScene: false,
        progress: 0.2,
        stall: false,
        repeat: false,
        loop: "none",
        urgency: 0,
        resolved: false,
      },
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("оглядываюсь");
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    expect(sliceOf(h.value)?.current).toMatchObject({
      id: "scene-001",
      label: "",
      type: "other",
      beat: 1,
    });
  });

  test("stall: saturated progress escalates guidance to climax → hard even with model urgency 0", async () => {
    const h = await bootWithProbe([
      verdict({ sameScene: false, progress: 0.3, urgency: 0 }),
      verdict({ sameScene: true, progress: 0.9, urgency: 0 }),
      verdict({ sameScene: true, progress: 0.95, urgency: 0 }),
      verdict({ sameScene: true, progress: 0.9, urgency: 0 }),
      verdict({ sameScene: true, progress: 0.9, urgency: 0 }),
      verdict({ sameScene: true, progress: 0.95, urgency: 0 }),
      verdict({ sameScene: true, progress: 0.9, urgency: 0 }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const tempoCfg = { climaxSaturatedBeats: 3, hardSaturatedBeats: 6 };
    const run = async (text: string) => {
      await h.value.turn(text);
      const idle = await h.value.waitIdle(5_000);
      expect(idle.ok).toBe(true);
    };

    await run("вхожу в зал");
    expect(sliceOf(h.value)?.highProgressBeats).toBe(0);
    await run("подхожу к капитану");
    expect(sliceOf(h.value)?.highProgressBeats).toBe(1);
    await run("спрашиваю о грузе");
    expect(sliceOf(h.value)?.highProgressBeats).toBe(2);
    await run("уточняю цену"); // 3rd saturated beat → climax despite urgency 0
    const s4 = sliceOf(h.value);
    expect(s4?.highProgressBeats).toBe(3);
    expect(deriveGuidanceMode(s4!, tempoCfg)).toBe("climax");

    await run("торгуюсь");
    await run("настаиваю на скидке");
    await run("соглашаюсь на цену"); // 6th saturated beat → hard
    const s7 = sliceOf(h.value);
    expect(s7?.highProgressBeats).toBe(6);
    expect(deriveGuidanceMode(s7!, tempoCfg)).toBe("hard");
    expect(sliceOf(h.value)?.lastVerdict?.urgency).toBe(0); // model never escalated
  });

  test("stall: fake scene change (sameScene:false at saturated progress) carries the clock", async () => {
    const h = await bootWithProbe([
      verdict({ sameScene: false, label: "Спальня", progress: 0.2 }),
      verdict({ sameScene: true, progress: 0.9 }),
      verdict({ sameScene: true, progress: 0.9 }),
      // Model reports a "new" scene but keeps progress saturated (pose change).
      verdict({ sameScene: false, label: "Та же спальня", type: "discovery", progress: 0.9 }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("вхожу в спальню");
    await h.value.waitIdle(5_000);
    await h.value.turn("подхожу к кровати");
    await h.value.waitIdle(5_000);
    await h.value.turn("ложусь");
    await h.value.waitIdle(5_000);
    const before = sliceOf(h.value);
    expect(before?.highProgressBeats).toBe(2);
    expect(before?.current?.id).toBe("scene-001");

    await h.value.turn("меняю позу");
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    const after = sliceOf(h.value);
    // A new scene was opened (id advanced) but the clock was NOT reset.
    expect(after?.current?.id).toBe("scene-002");
    expect(after?.highProgressBeats).toBe(3);
    expect(deriveGuidanceMode(after!, { climaxSaturatedBeats: 3, hardSaturatedBeats: 6 })).toBe(
      "climax",
    );
  });

  test("stall: genuine new scene (low progress) resets the clock", async () => {
    const h = await bootWithProbe([
      verdict({ sameScene: false, label: "Бар", progress: 0.9 }),
      verdict({ sameScene: true, progress: 0.9 }),
      verdict({ sameScene: true, progress: 0.9 }),
      // Player genuinely moves on — the new scene starts fresh (low progress).
      verdict({ sameScene: false, label: "Квартира", progress: 0.2 }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("сижу в баре");
    await h.value.waitIdle(5_000);
    await h.value.turn("заказываю выпить");
    await h.value.waitIdle(5_000);
    await h.value.turn("болтаю с барменом");
    await h.value.waitIdle(5_000);
    expect(sliceOf(h.value)?.highProgressBeats).toBe(3);

    await h.value.turn("ухожу в квартиру");
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    const after = sliceOf(h.value);
    expect(after?.current?.id).toBe("scene-002");
    expect(after?.highProgressBeats).toBe(0);
    expect(deriveGuidanceMode(after!, { climaxSaturatedBeats: 3, hardSaturatedBeats: 6 })).toBe(
      "develop",
    );
  });

  test("stall: a real resolve resets the clock and closes the scene", async () => {
    const h = await bootWithProbe([
      verdict({ sameScene: false, progress: 0.9 }),
      verdict({ sameScene: true, progress: 0.9 }),
      verdict({ sameScene: true, progress: 0.9 }),
      verdict({ sameScene: true, progress: 1, resolved: true }),
    ]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    await h.value.turn("начинаю");
    await h.value.waitIdle(5_000);
    await h.value.turn("продолжаю");
    await h.value.waitIdle(5_000);
    await h.value.turn("ещё раз");
    await h.value.waitIdle(5_000);
    expect(sliceOf(h.value)?.highProgressBeats).toBe(3);

    await h.value.turn("завершаю");
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);
    const after = sliceOf(h.value);
    expect(after?.current).toBeNull();
    expect(after?.highProgressBeats).toBe(0);
    expect(after?.history).toMatchObject([
      { id: "scene-001", outcome: "resolved" },
    ]);
  });

  test("edge: requires working-memory — boot fails when it is missing", async () => {
    const h = await testModules([createSceneControllerModule()], {
      llm: probeLlm([]),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_REQUIRES_MISSING");
  });
});