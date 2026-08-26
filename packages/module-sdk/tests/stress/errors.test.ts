import { describe, expect, test } from "bun:test";
import { bindCompiledModule } from "../../src/compile/bind-compiled-module.ts";
import { defineModule, deny, tryDefineModule } from "../../src/index.ts";
import {
  expectCommitted,
  expectRejected,
  expectSlice,
  scriptedToolLlm,
  testModule,
  testModules,
  type ToolScriptStep,
} from "../../src/test/index.ts";
import { z } from "zod";

/**
 * Stress E01–E26 error-code locks (specs/03 §6 DoD — each code has an
 * automated test for code + key details). Cases shared with S-tests stay in
 * their S-file; this file covers codes without a dedicated test: E01, E16,
 * E18 + the init/messages fail-loud guards (E15 family).
 */
describe("stress E-codes (errors.test.ts)", () => {
  test("E01: invalid defineModule id throws with stable MODULE_DEFINE_INVALID code", () => {
    const thrown = (() => {
      try {
        defineModule({ id: "Bad_Id!", version: "1.0.0", title: "Bad" });
        return null;
      } catch (e) {
        return e as Error & { code?: string };
      }
    })();
    expect(thrown).not.toBeNull();
    expect(thrown!.code).toBe("MODULE_DEFINE_INVALID");
    expect(thrown!.message).toContain("MODULE_DEFINE_INVALID");
    expect(thrown!.message).toContain("Bad_Id!");
  });

  test("E01b: subscribe name without canonical dot-full → MODULE_DEFINE_INVALID at define", () => {
    const bad = () =>
      defineModule({
        id: "dotless",
        version: "1.0.0",
        title: "Dotless",
        events: { subscribe: [{ name: "no_dot_here", handler() {} }] },
      });
    expect(() => bad()).toThrow(/MODULE_DEFINE_INVALID/);
    const viaTry = tryDefineModule({
      id: "dotless",
      version: "1.0.0",
      title: "Dotless",
      events: { subscribe: [{ name: "no_dot_here", handler() {} }] },
    });
    expect(viaTry.ok).toBe(false);
    if (!viaTry.ok) expect(viaTry.error.code).toBe("MODULE_DEFINE_INVALID");
  });

  test("E02: unknown ctx.op in collect moment → turn rejected MODULE_OP_UNKNOWN with known-ops hint", async () => {
    const mod = defineModule({
      id: "e02-op",
      version: "1.0.0",
      title: "E02 Op",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      turn: {
        change(ctx) {
          ctx.op("no_such_op");
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_OP_UNKNOWN");
    expect(turn.failure.message).toContain("bump");
    expectSlice(h.value, "e02_op", { n: 0 });
    await h.value.stop();
  });

  test("E03: IR/bind structural mismatch → MODULE_IR_BIND_MISMATCH (defensive, foreign IR producers)", () => {
    const ir = {
      irVersion: 1,
      sdkVersion: "1.0.0",
      manifest: { id: "e03", version: "1.0.0" },
      slice: undefined,
      configKey: undefined,
      allowedReadSlices: [],
      moments: {
        committed: true,
        seed: false,
        guard: false,
        soft: false,
        invariant: false,
        change: false,
        afterProse: false,
        rejected: false,
        load: false,
        narrativeSystem: false,
        narrativeUser: false,
        narrativeBrief: false,
        narrativeHistory: false,
        narrativeStyle: false,
        hostStatus: false,
        hostHelp: false,
        hostReadModels: [],
      },
      aiTasks: [],
      aiTools: [],
      capabilityKinds: [],
      lifecycle: { init: false, shutdown: false },
      events: { emit: [], subscribe: [] },
    };
    // IR claims `committed` but bindings declare no turn hooks → structural mismatch.
    const bindings = {
      seeds: [],
      rules: [],
      turns: [],
      narratives: [],
      host: [],
      aiTasks: new Map(),
      aiTools: new Map(),
      config: undefined,
      knownOps: new Set(),
      events: { emit: [], subscribe: [] },
      allowedReadSlices: [],
    };
    let thrown: unknown;
    try {
      bindCompiledModule({} as never, ir as never, bindings as never);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe("MODULE_IR_BIND_MISMATCH");
    expect((thrown as { message?: string }).message).toContain("e03");
  });

  test("E13: op payload invalid in collect moment → turn rejected MODULE_OP_PAYLOAD_INVALID", async () => {
    const mod = defineModule({
      id: "e13-op",
      version: "1.0.0",
      title: "E13 Op",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: {
            payload: z.object({ by: z.number() }).strict(),
            apply: (
              s: { schemaVersion: 1; n: number },
              p: { by: number },
            ): { schemaVersion: 1; n: number } => ({ ...s, n: s.n + p.by }),
          },
        },
      },
      turn: {
        change(ctx) {
          ctx.op("bump", { by: "not-a-number" });
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_OP_PAYLOAD_INVALID");
    expectSlice(h.value, "e13_op", { n: 0 });
    await h.value.stop();
  });

  test("E16: duplicate event publisher → boot fail MODULE_EVENT_DUPLICATE, both module ids", async () => {
    // Canonical emit names are auto-prefixed with the owner module id
    // (specs/06 §7.3), so SDK-level collisions are impossible by construction;
    // this exercises the defensive boot check via the raw register path
    // (non-author; future IR producers land here too).
    const mk = (id: string): import("@rpengineext/contracts").Module => ({
      manifest: {
        id,
        version: "1.0.0",
        displayName: id,
        description: "",
        engines: { core: "^1.0.0", contracts: "^1.0.0" },
        priority: 10,
        provides: [],
        requires: [],
        permissions: [],
        stateSlices: [],
        registers: ["event-emit:*"],
        contributes: [],
        interceptors: [],
      },
      register(ctx) {
        ctx.registerEventPublisher({ name: "raw_dup.clash", moduleId: id });
      },
    });
    const h = await testModules([mk("e16-a"), mk("e16-b")]);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_EVENT_DUPLICATE");
    expect(h.error.message).toContain("e16-a");
    expect(h.error.message).toContain("e16-b");
    expect(h.error.message).toContain("raw_dup.clash");
  });

  test("E18: emit payload invalid → MODULE_EVENT_PAYLOAD_INVALID (post-commit warning; turn committed)", async () => {
    const warnings: { code?: string }[] = [];
    const logger = {
      debug() {},
      info() {},
      warn(fields: unknown, _message?: string) {
        warnings.push({ code: (fields as { code?: string } | undefined)?.code });
      },
      error() {},
      child() {
        return logger;
      },
    } as unknown as import("@rpengineext/contracts").TurnLogger;

    const pub = defineModule({
      id: "e18-pub",
      version: "1.0.0",
      title: "E18 Pub",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      events: {
        emit: [
          {
            name: "changed",
            schema: z.object({ n: z.number() }).strict(),
          },
        ],
      },
      turn: {
        change(ctx) {
          ctx.op("bump");
        },
        committed(ctx) {
          // Wrong payload: `n` must be a number.
          ctx.emit("e18_pub.changed", { n: "not-a-number" });
        },
      },
    });
    const h = await testModule(pub, { log: logger });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    expect(warnings.some((w) => w.code === "MODULE_EVENT_PAYLOAD_INVALID")).toBe(true);
    expectSlice(h.value, "e18_pub", { n: 1 });
    await h.value.stop();
  });

  test("E15a: ctx.op inside ai.tasks.messages → fail loud with MODULE_MOMENT_OP_FORBIDDEN (no silent collect-and-discard)", async () => {
    const warnings: { code?: string }[] = [];
    const logger = {
      debug() {},
      info() {},
      warn(fields: unknown, _message?: string) {
        warnings.push({ code: (fields as { code?: string } | undefined)?.code });
      },
      error() {},
      child() {
        return logger;
      },
    } as unknown as import("@rpengineext/contracts").TurnLogger;

    const mod = defineModule({
      id: "msgs-writer",
      version: "1.0.0",
      title: "Msgs Writer",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      ai: {
        tasks: {
          sync: {
            description: "tool path with op in messages",
            input: z.object({}).strict(),
            output: z.object({ ok: z.boolean() }).strict(),
            runOn: { systemReason: "msgs_writer.sync" },
            tools: ["probe"],
            messages(input, _task, ctx) {
              ctx.op("bump");
              return [
                { role: "system", content: "call probe" },
                { role: "user", content: "go" },
              ];
            },
          },
        },
        tools: {
          probe: {
            description: "probe",
            args: z.object({}).strict(),
            result: z.object({ ok: z.boolean() }).strict(),
            handler() {
              return { ok: true };
            },
          },
        },
      },
    });
    const script: ToolScriptStep[] = [
      { tool: "msgs_writer.probe", args: {}, result: { ok: true } },
    ];
    const h = await testModule(mod, {
      llm: scriptedToolLlm(script),
      agentsMode: "llm",
      log: logger,
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.systemTurn("msgs_writer.sync");
    expect(turn.status).toBe("committed"); // system-turn failure is a warning
    // Fail loud: the task failure carries the E15 code (structured, never silent).
    expect(warnings.some((w) => w.code === "MODULE_MOMENT_OP_FORBIDDEN")).toBe(true);
    // World untouched: op was NOT silently applied.
    expectSlice(h.value, "msgs_writer", { n: 0 });
    await h.value.stop();
  });

  test("E15b: init ctx is write-forbidden — readSlice fails loud (no silent undefined)", async () => {
    const mod = defineModule({
      id: "init-reader",
      version: "1.0.0",
      title: "Init Reader",
      init(ctx) {
        ctx.readSlice("init_reader");
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_INIT_FAILED");
    expect(h.error.message).toContain("MODULE_MOMENT_OP_FORBIDDEN");
  });

  test("E15c: deny() in init → fail loud MODULE_MOMENT_OP_FORBIDDEN mention (boot fail E24)", async () => {
    const mod = defineModule({
      id: "init-denier",
      version: "1.0.0",
      title: "Init Denier",
      init() {
        deny("NOPE", "nope");
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_INIT_FAILED");
    expect(h.error.message).toContain("MODULE_MOMENT_OP_FORBIDDEN");
  });

  test("readModel provider throw → wrapped failure keeps provider code (not remapped to ARGS_INVALID)", async () => {
    const provider = defineModule({
      id: "rm-provider",
      version: "1.0.0",
      title: "RM Provider",
      host: {
        readModels: {
          "rm_provider.broken": {
            args: z.object({}).strict(),
            get() {
              throw new Error("provider boom");
            },
          },
        },
      },
    });
    const caller = defineModule({
      id: "rm-caller",
      version: "1.0.0",
      title: "RM Caller",
      turn: {
        change(ctx) {
          ctx.readModel("rm_provider.broken", {});
        },
      },
    });
    const h = await testModules([provider, caller]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_ERROR");
    await h.value.stop();
  });
});