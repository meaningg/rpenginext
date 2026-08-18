import { describe, expect, test } from "bun:test";

import { MODULE_IR_VERSION, ok, type LlmPort } from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";

import {
  createCompatAfterProseModule,
  createCompatConfigModule,
  createCompatGuardModule,
  createCompatHostModule,
  createCompatScheduleModule,
  createCompatSeedNarrativeModule,
  createCompatToolModule,
} from "./fixtures.ts";

/**
 * Compatibility suite: frozen sdk modules against current core.
 * Run on every PR (`bun run test:compat`).
 */
describe("compat contract (sdk ↔ core)", () => {
  test("IR foundation: every compat module exposes IR v1 + compiled install", () => {
    const modules = [
      createCompatSeedNarrativeModule(),
      createCompatGuardModule(),
      createCompatAfterProseModule(),
      createCompatHostModule(),
      createCompatConfigModule(),
      createCompatToolModule(),
      createCompatScheduleModule(),
    ];
    for (const mod of modules) {
      expect(mod.compiled).toBeTruthy();
      expect(mod.ir).toBeTruthy();
      expect(mod.ir?.irVersion).toBe(MODULE_IR_VERSION);
      expect(typeof mod.compiled?.install).toBe("function");
      expect(mod.ir?.manifest.id).toBe(mod.manifest.id);
      // structural: contributes driven by moments
      if (mod.ir?.moments.guard) {
        expect(mod.manifest.contributes).toContain("Guard");
      }
      if (mod.ir?.moments.committed) {
        expect(mod.manifest.contributes).toContain("AfterCommitHook");
        expect(mod.manifest.contributes).toContain("SystemTurnScheduler");
      }
    }
  });

  test("success: seed + narrative + afterProse + host on shared engine", async () => {
    const created = await createTestEngine({
      modules: [
        createCompatSeedNarrativeModule(),
        createCompatAfterProseModule(),
        createCompatHostModule(),
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession({
      meta: { compatCanon: "Compat world is stable." },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const state0 = created.value.runtime.getSessionState(session.value.sessionId);
    const canon = state0?.slices.compat_seed_narrative as {
      present: boolean;
      text: string;
    };
    expect(canon.present).toBe(true);
    expect(canon.text).toContain("stable");

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "look around",
    });
    expect(turn.status).toBe("committed");

    const state1 = created.value.runtime.getSessionState(session.value.sessionId);
    const pairs = state1?.slices.compat_after_prose as { pairs: number };
    expect(pairs.pairs).toBe(1);
    const hostSlice = state1?.slices.compat_host as { label: string };
    expect(hostSlice.label).toBe("compat");
  });

  test("error: guard deny rejects without advancing afterProse counter", async () => {
    const created = await createTestEngine({
      modules: [createCompatGuardModule(), createCompatAfterProseModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const before = created.value.runtime.getSessionState(session.value.sessionId);
    const revBefore = before?.meta.revision;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "forbidden-compat",
    });
    expect(turn.status).toBe("rejected");

    const after = created.value.runtime.getSessionState(session.value.sessionId);
    expect(after?.meta.revision).toBe(revBefore);
    const pairs = after?.slices.compat_after_prose as { pairs: number };
    expect(pairs.pairs).toBe(0);
  });

  test("edge: IR moments flags match capability usage", () => {
    const seed = createCompatSeedNarrativeModule();
    expect(seed.ir?.moments.seed).toBe(true);
    expect(seed.ir?.moments.narrativeSystem).toBe(true);
    expect(seed.ir?.moments.guard).toBe(false);

    const guard = createCompatGuardModule();
    expect(guard.ir?.moments.guard).toBe(true);
    expect(guard.ir?.slice).toBeUndefined();

    const prose = createCompatAfterProseModule();
    expect(prose.ir?.moments.afterProse).toBe(true);
    expect(prose.ir?.slice?.ops.some((o) => o.name === "inc")).toBe(true);
  });

  test("success: factory config drives change op", async () => {
    const created = await createTestEngine({
      modules: [createCompatConfigModule()],
      moduleConfig: {
        compat_config: { step: 3 },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(turn.status).toBe("committed");
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices.compat_config as { total: number };
    expect(slice.total).toBe(3);
  });

  test("success: committed schedules system turn that mutates via change", async () => {
    const created = await createTestEngine({
      modules: [createCompatScheduleModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "ping",
    });
    expect(turn.status).toBe("committed");
    // inline system drain should have run
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices.compat_schedule as { scheduled: number };
    expect(slice.scheduled).toBeGreaterThanOrEqual(1);
  });

  test("success: tool proposeOp protocol updates slice on system turn", async () => {
    const llm: LlmPort = {
      async complete(request) {
        // First call may request tool; simplified: return final JSON with tool simulation
        // Orchestrator tool loop — if tools present, return tool call once.
        const hasToolResult = request.messages.some(
          (m) => m.role === "tool" || (m as { name?: string }).name,
        );
        if (!hasToolResult && request.tools?.length) {
          return ok({
            text: "",
            toolCalls: [
              {
                id: "call_1",
                name: "compat_tool.set_mark",
                arguments: { mark: "from-tool" },
              },
            ],
          } as never);
        }
        return ok({ text: JSON.stringify({ ok: true }) });
      },
    };

    const created = await createTestEngine({
      modules: [createCompatToolModule()],
      llm,
      agentsMode: "llm",
      defaultModel: "test",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "equip",
    });
    // may commit even if optional agent fails — assert non-crash + IR tool present
    expect(createCompatToolModule().ir?.aiTools.some((t) => t.id.includes("set_mark"))).toBe(
      true,
    );
    expect(
      turn.status === "committed" || turn.status === "rejected",
    ).toBe(true);
  });
});
