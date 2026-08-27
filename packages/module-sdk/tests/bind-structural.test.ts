import { describe, expect, test } from "bun:test";

import { MODULE_IR_VERSION, type CompiledModuleIR } from "@rpengineext/contracts";
import { z } from "zod";

import { bindCompiledModule } from "../src/compile/bind-compiled-module.ts";
import type { ModuleBindings } from "../src/compile/bindings.ts";

function fakeCtx() {
  const calls: string[] = [];
  return {
    calls,
    ctx: {
      manifest: { id: "x" },
      log: {
        debug() {},
        info() {},
        warn() {},
        error() {},
        child() {
          return this;
        },
      },
      moduleConfig: {},
      registerSlice: () => ((calls.push("slice"), { ok: true as const, value: undefined })),
      registerCommand: () => ((calls.push("command"), { ok: true as const, value: undefined })),
      registerCapability: () => ({ ok: true as const, value: undefined }),
      registerConfigSchema: () => ({ ok: true as const, value: undefined }),
      registerMigration: () => ({ ok: true as const, value: undefined }),
      registerAgentTaskType: () => ({ ok: true as const, value: undefined }),
      registerAgentTool: () => ({ ok: true as const, value: undefined }),
      registerReadModel: () => ({ ok: true as const, value: undefined }),
      addGuard: () => ((calls.push("guard"), { ok: true as const, value: undefined })),
      addSoftGuard: () => ({ ok: true as const, value: undefined }),
      addInvariantPort: () => ({ ok: true as const, value: undefined }),
      addTransitionContributor: () => ((calls.push("change"), { ok: true as const, value: undefined })),
      addPostNarrativeContributor: () => ({ ok: true as const, value: undefined }),
      addAfterCommitHook: () => ((calls.push("committed"), { ok: true as const, value: undefined })),
      addSystemTurnScheduler: () => ((calls.push("sched"), { ok: true as const, value: undefined })),
      addOnTurnRejected: () => ({ ok: true as const, value: undefined }),
      addSessionHydrator: () => ({ ok: true as const, value: undefined }),
      addSessionBootstrap: () => ((calls.push("seed"), { ok: true as const, value: undefined })),
      addNarrativePromptContributor: () => ({ ok: true as const, value: undefined }),
      addNarrativeContextProvider: () => ({ ok: true as const, value: undefined }),
      addNarrativeStyleProvider: () => ({ ok: true as const, value: undefined }),
      addAgentToolHandler: () => ({ ok: true as const, value: undefined }),
      addAgentTaskContributor: () => ({ ok: true as const, value: undefined }),
      addStatusPanelProvider: () => ({ ok: true as const, value: undefined }),
      addHelpProvider: () => ({ ok: true as const, value: undefined }),
    } as never,
  };
}

describe("bindCompiledModule structural", () => {
  test("error: IR guard without binding throws", () => {
    const ir = {
      irVersion: MODULE_IR_VERSION,
      sdkVersion: "1.0.0",
      manifest: {
        id: "bad",
        version: "1.0.0",
        displayName: "Bad",
        description: "",
        engines: { core: "^1.0.0", contracts: "^1.0.0" },
        priority: 1,
        provides: [],
        requires: [],
        permissions: [],
        stateSlices: [],
        registers: [],
        contributes: ["Guard"],
        interceptors: [],
      },
      allowedReadSlices: [],
      moments: {
        seed: false,
        guard: true,
        soft: false,
        invariant: false,
        change: false,
        afterProse: false,
        committed: false,
        rejected: false,
        load: false,
        narrativeSystem: false,
        narrativeUser: false,
        narrativeBrief: false,
        narrativeHistory: false,
        narrativeStyle: false,
        narrativeCritic: false,
        hostStatus: false,
        hostHelp: false,
        hostReadModels: [],
      },
      aiTasks: [],
      aiTools: [],
      capabilityKinds: ["rules"],
      lifecycle: { init: false, shutdown: false },
      events: { emit: [], subscribe: [] },
    } satisfies CompiledModuleIR;

    const bindings: ModuleBindings = {
      allowedReadSlices: [],
      seeds: [],
      rules: [], // no guard
      turns: [],
      narratives: [],
      host: [],
      aiTasks: new Map(),
      aiTools: new Map(),
      knownOps: new Set(),
      events: { emit: [], subscribe: [] },
    };

    const { ctx } = fakeCtx();
    expect(() => bindCompiledModule(ctx, ir, bindings)).toThrow(/guard/);
  });

  test("success: change moment registers TransitionContributor only when IR says so", () => {
    const schema = z.object({ schemaVersion: z.literal(1), n: z.number() }).strict();
    const ir = {
      irVersion: MODULE_IR_VERSION,
      sdkVersion: "1.0.0",
      manifest: {
        id: "ok",
        version: "1.0.0",
        displayName: "Ok",
        description: "",
        engines: { core: "^1.0.0", contracts: "^1.0.0" },
        priority: 1,
        provides: [],
        requires: [],
        permissions: ["state:read", "state:propose:ok"],
        stateSlices: [{ name: "ok", schemaVersion: 1 }],
        registers: ["slice:ok", "command:ok.bump"],
        contributes: ["TransitionContributor"],
        interceptors: [],
      },
      slice: {
        name: "ok",
        schemaVersion: 1,
        ops: [{ name: "bump", commandType: "ok.bump", hasPayloadSchema: false }],
        hasMigrations: false,
      },
      allowedReadSlices: [],
      moments: {
        seed: false,
        guard: false,
        soft: false,
        invariant: false,
        change: true,
        afterProse: false,
        committed: false,
        rejected: false,
        load: false,
        narrativeSystem: false,
        narrativeUser: false,
        narrativeBrief: false,
        narrativeHistory: false,
        narrativeStyle: false,
        narrativeCritic: false,
        hostStatus: false,
        hostHelp: false,
        hostReadModels: [],
      },
      aiTasks: [],
      aiTools: [],
      capabilityKinds: ["state", "turn"],
      lifecycle: { init: false, shutdown: false },
      events: { emit: [], subscribe: [] },
    } satisfies CompiledModuleIR;

    const ops = new Map([
      ["bump", { apply: (s: { n: number }) => ({ ...s, n: s.n + 1 }) }],
    ]);
    const bindings: ModuleBindings = {
      state: {
        schema,
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: ops as never,
      },
      allowedReadSlices: [],
      seeds: [],
      rules: [],
      turns: [{ kind: "turn", change: () => undefined }],
      narratives: [],
      host: [],
      aiTasks: new Map(),
      aiTools: new Map(),
      knownOps: new Set(["bump"]),
      events: { emit: [], subscribe: [] },
    };

    const { ctx, calls } = fakeCtx();
    bindCompiledModule(ctx, ir, bindings);
    expect(calls).toContain("slice");
    expect(calls).toContain("command");
    expect(calls).toContain("change");
    expect(calls).not.toContain("guard");
  });
});
