import { describe, expect, test } from "bun:test";
import { InMemoryPersistence } from "@rpengineext/core";
import { createTestEngine } from "@rpengineext/core/testing";
import { z } from "zod";

import { defineModule, deny } from "../../src/index.ts";
import {
  expectCommitted,
  expectSlice,
  fixedProseLlm,
  scriptedToolLlm,
  testModule,
  type ToolScriptStep,
} from "../../src/test/index.ts";

describe("stress S09/S11/S19 (background + tool system turns)", () => {
  test("S09: 2× scheduleSystem background — player ok; waitIdle; no corruption", async () => {
    const mod = defineModule({
      id: "bg-mod",
      version: "1.0.0",
      title: "BG",
      state: {
        schema: z
          .object({ schemaVersion: z.literal(1), runs: z.number() })
          .strict(),
        initial: { schemaVersion: 1 as const, runs: 0 },
        ops: {
          record_run: (s, p: { by: number }) => ({ ...s, runs: s.runs + p.by }),
        },
      },
      turn: {
        committed(ctx) {
          ctx.scheduleSystem({ reason: "bg.run", mode: "background" });
          ctx.scheduleSystem({ reason: "bg.run", mode: "background" });
        },
      },
      ai: {
        tasks: {
          runner: {
            description: "bg runner",
            input: z.object({}).strict(),
            output: z.object({ done: z.boolean() }).strict(),
            runOn: { systemReason: "bg.run" },
            messages: () => [
              { role: "system" as const, content: "return JSON" },
              { role: "user" as const, content: "go" },
            ],
          },
        },
      },
    });

    const h = await testModule(mod, {
      llm: fixedProseLlm(JSON.stringify({ done: true })),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("go");
    expectCommitted(turn);
    const idle = await h.value.waitIdle(10_000);
    expect(idle.ok).toBe(true);
    // Both background runs executed without corrupting the slice.
    const state = h.value.state()!;
    expect(state.slices.bg_mod).toBeTruthy();
    expect(state.meta.revision).toBeGreaterThan(0);
    await h.value.stop();
  });

  test("S11: tool proposeOp in system turn — state updated only after successful path", async () => {
    const mod = defineModule({
      id: "s11-mod",
      version: "1.0.0",
      title: "S11",
      state: {
        schema: z
          .object({ schemaVersion: z.literal(1), mark: z.string() })
          .strict(),
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
          ctx.scheduleSystem({ reason: "s11.sync", mode: "background" });
        },
      },
      ai: {
        tasks: {
          sync: {
            description: "sync",
            input: z.object({}).strict(),
            output: z.object({ ok: z.boolean() }).strict(),
            runOn: { systemReason: "s11.sync" },
            tools: ["apply"],
            messages: () => [
              { role: "system" as const, content: "call apply" },
              { role: "user" as const, content: "go" },
            ],
          },
        },
        tools: {
          apply: {
            description: "apply mark",
            args: z.object({ mark: z.string() }).strict(),
            result: z.object({ ok: z.boolean() }).strict(),
            handler(args, ctx) {
              if (args.mark === "bad") {
                deny("MARK_BAD", "mark rejected");
              }
              ctx.proposeOp("set_mark", { mark: args.mark as string });
              return { ok: true };
            },
          },
        },
      },
    });

    const okScript: ToolScriptStep[] = [
      { tool: "s11_mod.apply", args: { mark: "good" }, result: { ok: true } },
    ];
    const h = await testModule(mod, {
      llm: scriptedToolLlm(okScript),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    const idle = await h.value.waitIdle(10_000);
    expect(idle.ok).toBe(true);
    expectSlice(h.value, "s11_mod", { mark: "good" });
    await h.value.stop();

    // Deny path: no partial world write.
    const denyScript: ToolScriptStep[] = [
      { tool: "s11_mod.apply", args: { mark: "bad" }, result: { ok: false } },
    ];
    const h2 = await testModule(mod, {
      llm: scriptedToolLlm(denyScript),
      agentsMode: "llm",
    });
    expect(h2.ok).toBe(true);
    if (!h2.ok) return;
    const turn2 = await h2.value.turn("go");
    expectCommitted(turn2);
    const idle2 = await h2.value.waitIdle(10_000);
    expect(idle2.ok).toBe(true);
    expectSlice(h2.value, "s11_mod", { mark: "" });
    await h2.value.stop();
  });

  test("S19: pending scheduled system turns survive save/load and drain after load", async () => {
    const mod = defineModule({
      id: "s19-mod",
      version: "1.0.0",
      title: "S19",
      state: {
        schema: z
          .object({ schemaVersion: z.literal(1), runs: z.number() })
          .strict(),
        initial: { schemaVersion: 1 as const, runs: 0 },
        ops: {
          record_run: (s) => ({ ...s, runs: s.runs + 1 }),
        },
      },
      turn: {
        committed(ctx) {
          ctx.scheduleSystem({ reason: "s19.run", mode: "background" });
        },
        change(ctx) {
          if (ctx.turnKind !== "system") return;
          const text =
            (ctx.action as { text?: string } | undefined)?.text ?? "";
          if (text === "s19.run") {
            ctx.op("record_run");
          }
        },
      },
      ai: {
        tasks: {
          runner: {
            description: "runner",
            input: z.object({}).strict(),
            output: z.object({ done: z.boolean() }).strict(),
            runOn: { systemReason: "s19.run" },
            messages: () => [
              { role: "system" as const, content: "JSON" },
              { role: "user" as const, content: "go" },
            ],
          },
        },
      },
    });

    // Save a snapshot that still carries an un-drained background turn — the
    // engine pump runs immediately, so we craft the pending queue on top of the
    // last committed snapshot (same shape an in-flight save would produce).
    const persistence = new InMemoryPersistence();
    const llm = fixedProseLlm(JSON.stringify({ done: true }));
    const engineA = await createTestEngine({
      modules: [mod],
      llm,
      agentsMode: "llm",
      persistence,
    });
    expect(engineA.ok).toBe(true);
    if (!engineA.ok) return;
    const sessionA = await engineA.value.engine.startSession({ seed: "s19" });
    expect(sessionA.ok).toBe(true);
    if (!sessionA.ok) return;

    const turn = await sessionA.value.submitAction({ kind: "free_text", text: "one" });
    expectCommitted(turn);
    await engineA.value.runtime.waitIdle(sessionA.value.sessionId, 10_000);

    const snapshot = await persistence.load(sessionA.value.sessionId);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok || !snapshot.value) return;
    expect(snapshot.value.pendingSystemTurns ?? []).toHaveLength(0);

    // Emulate a save taken while a background turn is still pending: the
    // queue is a first-class snapshot field and must roundtrip.
    const withPending: typeof snapshot.value = {
      ...snapshot.value,
      pendingSystemTurns: [
        ...(snapshot.value.pendingSystemTurns ?? []),
        {
          reason: "s19.run",
          mode: "background" as const,
          requestedByModuleId: "s19-mod",
        },
      ],
    };
    const persisted = await persistence.save(withPending);
    expect(persisted.ok).toBe(true);
    await engineA.value.engine.stop();

    // Engine B loads the same store: restored queue drains after load.
    const engineB = await createTestEngine({
      modules: [mod],
      llm,
      agentsMode: "llm",
      persistence,
    });
    expect(engineB.ok).toBe(true);
    if (!engineB.ok) return;
    const sessionB = await engineB.value.engine.loadSession(sessionA.value.sessionId);
    expect(sessionB.ok).toBe(true);
    if (!sessionB.ok) return;

    // Load-time pump drains synchronously; restoration is proven by the
    // drained run below (the crafted pending turn executes exactly once).
    const idle = await engineB.value.runtime.waitIdle(
      sessionA.value.sessionId,
      10_000,
    );
    expect(idle.ok).toBe(true);
    const stateB = engineB.value.runtime.getSessionState(sessionA.value.sessionId)!;
    expect(stateB.slices.s19_mod).toBeTruthy();
    // runs=1 from engine A's drain + 1 from the restored pending turn.
    expect((stateB.slices.s19_mod as { runs: number }).runs).toBe(2);
    expect(
      engineB.value.runtime.getPendingSystemTurns(sessionA.value.sessionId),
    ).toHaveLength(0);

    await engineB.value.engine.stop();
  });
});