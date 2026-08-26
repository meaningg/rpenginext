import { describe, expect, test } from "bun:test";
import { defineModule } from "../../src/index.ts";
import { testModule, testModules } from "../../src/test/index.ts";
import { z } from "zod";

import { createNoopStressModule, runNoopStress } from "./fixtures.ts";

/**
 * Perf tripwire baselines (specs/02 §5.4) — recorded on a local CI-class
 * machine, generous 3×+ headroom. Fail only on pathological regression.
 * See tests/stress/README.md for the bounds process.
 */
const BOUNDS = {
  boot30: 5_000,
  boot100: 15_000,
  turn30: 5_000,
  turn100: 15_000,
} as const;

describe("stress S01–S04 (boot pressure)", () => {
  test("S01: boot N=30 no-op modules", async () => {
    const result = await testModules(
      Array.from({ length: 30 }, (_, i) => createNoopStressModule(i + 1)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modules).toHaveLength(30);
    await result.value.stop();
  });

  test("S02: duplicate module id → fail, stable code, ids in message", async () => {
    const a = defineModule({ id: "dup-id", version: "1.0.0", title: "A" });
    const b = defineModule({ id: "dup-id", version: "1.0.0", title: "B" });
    const result = await testModules([a, b]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MODULE_ID_DUPLICATE");
    expect(result.error.message).toContain("dup-id");
  });

  test("S03: duplicate slice name → fail, stable code", async () => {
    const mk = (id: string) =>
      defineModule({
        id,
        version: "1.0.0",
        title: id,
        state: {
          name: "shared_slice",
          schema: z.object({ schemaVersion: z.literal(1) }).strict(),
          initial: { schemaVersion: 1 as const },
        },
      });
    const result = await testModules([mk("slicer-a"), mk("slicer-b")]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MODULE_SLICE_DUPLICATE");
    expect(result.error.message).toContain("shared_slice");
  });

  test("S04: missing requires (strict default) → boot fail MODULE_REQUIRES_MISSING", async () => {
    const needs = defineModule({
      id: "needs-missing",
      version: "1.0.0",
      title: "Needs",
      requires: ["capability:not-loaded"],
    });
    const strict = await testModule(needs);
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.error.code).toBe("MODULE_REQUIRES_MISSING");
    expect(strict.error.message).toContain("capability:not-loaded");
  });
});

describe("stress P01/P03 (documented bounds)", () => {
  test(
    "P01: boot N=30 under recorded bound",
    async () => {
      const started = performance.now();
      const result = await testModules(
        Array.from({ length: 30 }, (_, i) => createNoopStressModule(i + 1)),
      );
      const elapsed = performance.now() - started;
      expect(result.ok).toBe(true);
      expect(elapsed).toBeLessThan(BOUNDS.boot30);
      if (!result.ok) return;
      await result.value.stop();
    },
    { timeout: 30_000 },
  );

  test(
    "P03: boot N=100 no-op modules (events declared) under recorded bound",
    async () => {
      const started = performance.now();
      const result = await testModules(
        Array.from({ length: 100 }, (_, i) => createNoopStressModule(i + 1)),
      );
      const elapsed = performance.now() - started;
      expect(result.ok).toBe(true);
      expect(elapsed).toBeLessThan(BOUNDS.boot100);
      if (!result.ok) return;
      await result.value.stop();
    },
    { timeout: 60_000 },
  );
});

describe("stress P02/P04 (turn with handlers, documented bounds)", () => {
  test(
    "P02: one mock turn with N=30 empty handlers under bound",
    async () => {
      const result = await testModules(
        Array.from({ length: 30 }, (_, i) => createNoopStressModule(i + 1)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const started = performance.now();
      const turn = await result.value.turn("hello");
      const elapsed = performance.now() - started;
      expect(turn.status).toBe("committed");
      expect(elapsed).toBeLessThan(BOUNDS.turn30);
      await result.value.stop();
    },
    { timeout: 30_000 },
  );

  test(
    "P04: one mock turn with N=100 handlers + event fan-out under bound",
    async () => {
      const result = await testModules(
        Array.from({ length: 100 }, (_, i) => createNoopStressModule(i + 1)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const started = performance.now();
      const turn = await result.value.turn("hello");
      const elapsed = performance.now() - started;
      expect(turn.status).toBe("committed");
      expect(elapsed).toBeLessThan(BOUNDS.turn100);
      await result.value.stop();
    },
    { timeout: 60_000 },
  );
});

// keep runNoopStress import used for future cases / debugging
void runNoopStress;