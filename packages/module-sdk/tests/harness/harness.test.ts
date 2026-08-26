import { describe, expect, test } from "bun:test";
import { defineModule, deny } from "../../src/index.ts";
import { z } from "zod";

import {
  expectCommitted,
  expectEvent,
  expectRejected,
  expectSlice,
  fixedProseLlm,
  scriptedToolLlm,
  testModule,
  testModules,
  type ToolScriptStep,
} from "../../src/test/index.ts";

function bumpModule() {
  return defineModule({
    id: "bump-mod",
    version: "1.0.0",
    title: "Bump",
    state: {
      name: "bump_mod",
      schema: z.object({ schemaVersion: z.literal(1), value: z.number() }).strict(),
      initial: { schemaVersion: 1 as const, value: 0 },
      ops: {
        bump: {
          payload: z.object({ by: z.number().int() }).strict(),
          apply: (s: { schemaVersion: 1; value: number }, p: { by: number }) => ({
            ...s,
            value: s.value + p.by,
          }),
        },
      },
    },
    turn: {
      change(ctx) {
        ctx.op("bump", { by: 1 });
      },
    },
  });
}

describe("harness API", () => {
  test("success: turn + slice + asserts", async () => {
    const h = await testModule(bumpModule());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    expectSlice(h.value, "bump_mod", { value: 1 });
    expect(h.value.sliceOf<{ schemaVersion: number; value: number }>("bump_mod")).toEqual({
      schemaVersion: 1,
      value: 1,
    });
  });

  test("reject: guard deny with code", async () => {
    const mod = defineModule({
      id: "guard-mod",
      version: "1.0.0",
      title: "Guard",
      rules: {
        guard(ctx) {
          const text = (ctx.normalizedAction as { text?: string } | undefined)?.text;
          if (text === "nope") {
            deny("NOPE", "not allowed");
          }
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const rejected = await h.value.turn("nope");
    expectRejected(rejected, "NOPE");
  });

  test("edge: multi-module boot + modules inventory", async () => {
    const other = defineModule({
      id: "other-mod",
      version: "1.0.0",
      title: "Other",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
      },
    });
    const h = await testModules([bumpModule(), other]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.value.modules.map((m) => m.id)).toEqual(["bump-mod", "other-mod"]);
  });

  test("edge: fixedProseLlm drives committed player turn", async () => {
    const mod = defineModule({
      id: "prose-mod",
      version: "1.0.0",
      title: "Prose",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          add: (s, p: { n: number }) => ({ ...s, n: s.n + p.n }),
        },
      },
      turn: {
        change(ctx) {
          ctx.op("add", { n: 1 });
        },
      },
    });
    const h = await testModule(mod, {
      llm: fixedProseLlm("fixed story prose"),
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    expect(turn.passage.prose).toContain("fixed story prose");
  });

  test("success: scriptedToolLlm tool path updates state via proposeOp", async () => {
    const mod = defineModule({
      id: "tool-mod",
      version: "1.0.0",
      title: "Tool",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), mark: z.string() }).strict(),
        initial: { schemaVersion: 1 as const, mark: "" },
        ops: {
          set_mark: {
            payload: z.object({ mark: z.string() }).strict(),
            apply: (s: { schemaVersion: 1; mark: string }, p: { mark: string }) => ({
              ...s,
              mark: p.mark,
            }),
          },
        },
      },
      turn: {
        committed(ctx) {
          ctx.scheduleSystem({ reason: "tool_demo", mode: "background" });
        },
      },
      ai: {
        tasks: {
          demo: {
            description: "demo task",
            input: z.object({}).strict(),
            output: z.object({ ok: z.boolean() }).strict(),
            runOn: { systemReason: "tool_demo" },
            tools: ["marker"],
            messages: () => [
              {
                role: "system" as const,
                content: "Call the marker tool, then return JSON {ok:true}",
              },
              { role: "user" as const, content: "go" },
            ],
          },
        },
        tools: {
          marker: {
            description: "Set mark",
            args: z.object({ mark: z.string() }).strict(),
            result: z.object({ ok: z.boolean() }).strict(),
            handler(args, ctx) {
              ctx.proposeOp("set_mark", { mark: args.mark as string });
              return { ok: true };
            },
          },
        },
      },
    });

    const script: ToolScriptStep[] = [
      { tool: "tool_mod.marker", args: { mark: "x" }, result: { ok: true } },
    ];
    const h = await testModule(mod, {
      llm: scriptedToolLlm(script, JSON.stringify({ ok: true })),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("please");
    expectCommitted(turn);

    const idle = await h.value.waitIdle(10_000);
    expect(idle.ok).toBe(true);
    expectSlice(h.value, "tool_mod", { mark: "x" });
  });

  test("success: save/load roundtrip restores slice", async () => {
    const h = await testModule(bumpModule());
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("one");
    expectCommitted(turn);
    expectSlice(h.value, "bump_mod", { value: 1 });

    const saved = await h.value.save();
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const loaded = await h.value.load(saved.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expectSlice(h.value, "bump_mod", { value: 1 });

    const turn2 = await h.value.turn("two");
    expectCommitted(turn2);
    expectSlice(h.value, "bump_mod", { value: 2 });
    await h.value.stop();
  });

  test("success: harness readModel surface + events log", async () => {
    const pub = defineModule({
      id: "evt-pub",
      version: "1.0.0",
      title: "Publisher",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      host: {
        readModels: {
          "evt_pub.count": (state) => ({
            n: (state.slices.evt_pub as { n: number }).n,
          }),
        },
      },
      events: {
        emit: [{ name: "changed", schema: z.object({ n: z.number() }).strict() }],
      },
      turn: {
        change(ctx) {
          ctx.op("bump");
        },
        committed(ctx) {
          // committed observes the pre-turn snapshot (host 0.x semantics kept
          // for 1.0); the new value is derivable from the op history / passage.
          ctx.emit("evt_pub.changed", { n: (ctx.slice as { n: number }).n + 1 });
        },
      },
    });
    const sub = defineModule({
      id: "evt-sub",
      version: "1.0.0",
      title: "Subscriber",
      priority: 10,
      events: {
        subscribe: [
          {
            name: "evt_pub.changed",
            handler(ctx, event) {
              ctx.log.info(`got ${JSON.stringify(event.payload)}`);
            },
          },
        ],
      },
    });

    const h = await testModules([pub, sub]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("one");
    expectCommitted(turn);
    expectEvent(h.value, "evt_pub.changed", { n: 1 });
    expect(h.value.readModel("evt_pub.count")).toEqual({ n: 1 });
    await h.value.stop();
  });

  test("reject: strict capabilities default ON fails boot on missing requires", async () => {
    const needs = defineModule({
      id: "needs-cap",
      version: "1.0.0",
      title: "Needs",
      requires: ["capability:missing-cap"],
    });
    const strict = await testModule(needs);
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.error.code).toBe("MODULE_REQUIRES_MISSING");

    const lenient = await testModule(needs, { strictCapabilities: false });
    expect(lenient.ok).toBe(true);
  });
});