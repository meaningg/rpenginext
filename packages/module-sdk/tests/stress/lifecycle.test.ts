import { describe, expect, test } from "bun:test";
import { defineModule } from "../../src/index.ts";
import { expectCommitted, testModule, testModules } from "../../src/test/index.ts";
import { z } from "zod";
import { createLogger } from "@rpengineext/logger";

describe("stress S21 (lifecycle init/shutdown)", () => {
  test("S21a: init failure → boot fail MODULE_INIT_FAILED; engine does not start", async () => {
    const mod = defineModule({
      id: "init-boom",
      version: "1.0.0",
      title: "Init Boom",
      async init() {
        throw new Error("cannot reach resource");
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_INIT_FAILED");
    expect(h.error.message).toContain("init-boom");
  });

  test("S21b: shutdown error → warning MODULE_SHUTDOWN_ERROR; stop does not fail", async () => {
    const collected: string[] = [];
    const warnings: { code?: string; message?: string }[] = [];
    // Spy logger: children share the same warning sink (registry children
    // the module-registry logger).
    const spyLogger = {
      debug() {},
      info() {},
      warn(fields: unknown, message?: string) {
        warnings.push({
          code: (fields as { code?: string } | undefined)?.code,
          message,
        });
      },
      error() {},
      child() {
        return spyLogger;
      },
    } as unknown as import("@rpengineext/contracts").TurnLogger;

    const mod = defineModule({
      id: "shutdown-boom",
      version: "1.0.0",
      title: "Shutdown Boom",
      async shutdown() {
        collected.push("shutdown");
        throw new Error("cleanup failed");
      },
      turn: {
        change(ctx) {
          collected.push("turn");
        },
      },
    });

    const { createTestEngine } = await import("@rpengineext/core/testing");
    const created = await createTestEngine({ modules: [mod], log: spyLogger });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({ kind: "free_text", text: "x" });
    expectCommitted(turn);
    const stopped = await created.value.engine.stop();
    expect(stopped.ok).toBe(true); // stop never fails
    expect(collected).toContain("shutdown");
    expect(warnings.some((w) => w.code === "MODULE_SHUTDOWN_ERROR")).toBe(true);
  });

  test("S21c: init priority asc, shutdown reverse (ordering)", async () => {
    const order: string[] = [];
    const mk = (id: string, priority: number) =>
      defineModule({
        id,
        version: "1.0.0",
        title: id,
        priority,
        async init() {
          order.push(`init:${id}`);
        },
        async shutdown() {
          order.push(`shutdown:${id}`);
        },
      });

    const { createTestEngine } = await import("@rpengineext/core/testing");
    const created = await createTestEngine({
      modules: [mk("life-c", 30), mk("life-a", 10), mk("life-b", 20)],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await created.value.engine.stop();

    expect(order).toEqual([
      "init:life-a",
      "init:life-b",
      "init:life-c",
      "shutdown:life-c",
      "shutdown:life-b",
      "shutdown:life-a",
    ]);
  });

  test("S21d: init world-access fails loud (ctx.op in init)", async () => {
    const mod = defineModule({
      id: "init-writer",
      version: "1.0.0",
      title: "Init Writer",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      init(ctx) {
        ctx.op("bump");
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_INIT_FAILED");
    expect(h.error.message).toContain("MODULE_MOMENT_OP_FORBIDDEN");
  });

  test("S21e: harness stop() runs shutdown", async () => {
    let shut = false;
    const mod = defineModule({
      id: "life-stop",
      version: "1.0.0",
      title: "Life Stop",
      async shutdown() {
        shut = true;
      },
    });
    const { testModule } = await import("../../src/test/index.ts");
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    void expectCommitted;
    if (!h.ok) return;
    await h.value.stop();
    expect(shut).toBe(true);
  });
});

void testModules;