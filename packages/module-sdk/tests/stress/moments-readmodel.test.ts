import { describe, expect, test } from "bun:test";
import { defineModule } from "../../src/index.ts";
import { expectCommitted, expectRejected, testModule } from "../../src/test/index.ts";
import { z } from "zod";

describe("stress S13–S14 (moments permissions + readModel fail-loud)", () => {
  test("S13: ctx.op inside committed → MODULE_MOMENT_OP_FORBIDDEN; world unchanged beyond already-committed player turn", async () => {
    const mod = defineModule({
      id: "s13-mod",
      version: "1.0.0",
      title: "S13",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          inc: (s, p: { by?: number }) => ({ ...s, n: s.n + (Number(p.by) || 1) }),
        },
      },
      turn: {
        change(ctx) {
          ctx.op("inc", { by: 1 });
        },
        committed(ctx) {
          // Write attempt in a write-forbidden moment — must fail loud.
          (ctx as { op: (op: string, p?: object) => void }).op("inc", { by: 100 });
        },
      },
    });

    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("go");
    // The player turn itself commits; the committed-moment violation is a
    // post-outcome warning (never silent, never a rollback).
    expectCommitted(turn);
    expect((h.value.slice as { n: number }).n).toBe(1);
  });

  test("S13b: ctx.op inside narrative → turn rejected with MODULE_MOMENT_OP_FORBIDDEN (mid-turn)", async () => {
    const mod = defineModule({
      id: "s13b-mod",
      version: "1.0.0",
      title: "S13B",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          inc: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      narrative: {
        system: (ctx) => {
          ctx.op("inc");
          return null;
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_MOMENT_OP_FORBIDDEN");
    await h.value.stop();
  });

  test("S14: unknown ctx.readModel name → MODULE_READ_MODEL_UNKNOWN (change moment)", async () => {
    const mod = defineModule({
      id: "s14-mod",
      version: "1.0.0",
      title: "S14",
      turn: {
        change(ctx) {
          ctx.readModel("no_such.reader");
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_READ_MODEL_UNKNOWN");
    await h.value.stop();
  });

  test("S14b: unknown ctx.readModel name → MODULE_READ_MODEL_UNKNOWN (narrative moment)", async () => {
    const mod = defineModule({
      id: "s14b-mod",
      version: "1.0.0",
      title: "S14B",
      narrative: {
        system: (ctx) => {
          ctx.readModel("no_such.reader");
          return null;
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_READ_MODEL_UNKNOWN");
    await h.value.stop();
  });

  test("S14c: readModel args fail provider schema → MODULE_READ_MODEL_ARGS_INVALID", async () => {
    const provider = defineModule({
      id: "rm-provider",
      version: "1.0.0",
      title: "RM Provider",
      host: {
        readModels: {
          "rm_provider.pick": {
            args: z.object({ id: z.string().min(1) }).strict(),
            get: (state, args) => ({ id: (args as { id: string }).id }),
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
          ctx.readModel("rm_provider.pick", { id: 42 });
        },
      },
    });
    const { testModules } = await import("../../src/test/index.ts");
    const good = await testModules([provider, caller]);
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    const turn = await good.value.turn("go");
    expectRejected(turn, "MODULE_READ_MODEL_ARGS_INVALID");
    await good.value.stop();

    // Valid args → committed with data.
    const caller2 = defineModule({
      id: "rm-caller2",
      version: "1.0.0",
      title: "RM Caller 2",
      turn: {
        change(ctx) {
          const result = ctx.readModel<{ id: string }>("rm_provider.pick", {
            id: "abc",
          });
          if (result.id !== "abc") throw new Error("readModel mismatch");
        },
      },
    });
    const ok2 = await testModules([provider, caller2]);
    expect(ok2.ok).toBe(true);
    if (!ok2.ok) return;
    const turn2 = await ok2.value.turn("go");
    expectCommitted(turn2);
    await ok2.value.stop();
  });
});