import { describe, expect, test } from "bun:test";
import { defineModule } from "../../src/index.ts";
import { expectCommitted, testModules } from "../../src/test/index.ts";
import { z } from "zod";

function sliceModule(id: string, slice: string, seedValue: number) {
  return defineModule({
    id,
    version: "1.0.0",
    title: id,
    state: {
      name: slice,
      schema: z
        .object({ schemaVersion: z.literal(1), value: z.number() })
        .strict(),
      initial: { schemaVersion: 1 as const, value: seedValue },
      ops: {
        bump: (s, p: { by: number }) => ({ ...s, value: s.value + p.by }),
      },
    },
    turn: {
      change(ctx) {
        ctx.op("bump", { by: 1 });
      },
    },
  });
}

describe("stress S10 (multi-slice save/load roundtrip)", () => {
  test("S10: save/load with 10 slices → roundtrip equality", async () => {
    const modules = Array.from({ length: 10 }, (_, i) =>
      sliceModule(`sl-${String(i + 1).padStart(2, "0")}`, `sl_${String(i + 1).padStart(2, "0")}`, i),
    );
    const h = await testModules(modules);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("one");
    expectCommitted(turn);

    const before = h.value.state()!;
    const saved = await h.value.save();
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const loaded = await h.value.load(saved.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const after = h.value.state()!;
    expect(JSON.stringify(after.slices)).toBe(JSON.stringify(before.slices));
    expect(Object.keys(after.slices)).toHaveLength(10);
    for (let i = 1; i <= 10; i += 1) {
      const key = `sl_${String(i).padStart(2, "0")}`;
      expect((after.slices[key] as { value: number }).value).toBe(i);
    }
    await h.value.stop();
  });
});