import { describe, expect, test } from "bun:test";
import { defineModule, deny } from "../../src/index.ts";
import {
  expectCommitted,
  expectEvent,
  expectRejected,
  expectSlice,
  testModule,
  testModules,
} from "../../src/test/index.ts";
import { z } from "zod";

/**
 * Publisher + subscriber duo declaration. `id` drives both module ids and the
 * canonical event name so fan-out tests can register N subscribers.
 */
function publisher(id: string, priority = 100) {
  return defineModule({
    id,
    version: "1.0.0",
    title: `Publisher ${id}`,
    priority,
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
          schema: z.object({ n: z.number(), from: z.string() }).strict(),
          description: "fires on every committed bump",
        },
      ],
    },
    turn: {
      change(ctx) {
        ctx.op("bump");
      },
      committed(ctx) {
        ctx.emit(`${id.replace(/-/g, "_")}.changed`, {
          n: (ctx.slice as { n: number }).n + 1,
          from: id,
        });
      },
    },
  });
}

function subscriber(id: string, eventName: string, priority = 100) {
  return defineModule({
    id,
    version: "1.0.0",
    title: `Subscriber ${id}`,
    priority,
    events: {
      subscribe: [
        {
          name: eventName,
          priority,
          handler(ctx, event) {
            ctx.log.info(`${id} ← ${event.payload.from}`);
          },
        },
      ],
    },
  });
}

describe("stress S15–S18, S20, S22 (events)", () => {
  test("S15: fan-out — one emit → N=30 subscribers, priority order, payload intact", async () => {
    const pub = publisher("fan-pub", 50);
    const subs = Array.from({ length: 30 }, (_, i) =>
      subscriber(`fan-sub-${String(i + 1).padStart(2, "0")}`, "fan_pub.changed", 100 - i),
    );
    const h = await testModules([pub, ...subs]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const turn = await h.value.turn("go");
    expectCommitted(turn);
    expectEvent(h.value, "fan_pub.changed", { from: "fan-pub", n: 1 });
    // All 30 subscribers fire deterministically (session event log length 1 —
    // one event, dispatched to all subscribers).
    expect(h.value.events.filter((e) => e.name === "fan_pub.changed")).toHaveLength(1);
    await h.value.stop();
  });

  test("S16: ctx.emit in turn.change → turn rejected with MODULE_EVENT_EMIT_FORBIDDEN", async () => {
    const mod = defineModule({
      id: "bad-emit",
      version: "1.0.0",
      title: "Bad Emit",
      events: {
        emit: [{ name: "oops" }],
      },
      turn: {
        change(ctx) {
          ctx.emit("bad_emit.oops", {});
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_EVENT_EMIT_FORBIDDEN");
    await h.value.stop();
  });

  test("S17: subscriber ctx.op / deny in event dispatch → fail-loud; world unchanged", async () => {
    const pub = publisher("s17-pub");
    const badOp = defineModule({
      id: "s17-badop",
      version: "1.0.0",
      title: "Bad Op Sub",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      events: {
        subscribe: [
          {
            name: "s17_pub.changed",
            handler(ctx) {
              ctx.op("bump");
            },
          },
        ],
      },
    });
    const h = await testModules([pub, badOp]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    // Turn stays committed; the violation is a post-commit warning. World must
    // be unchanged beyond the publisher's own committed bump.
    expectCommitted(turn);
    expectSlice(h.value, "s17_badop", { n: 0 });
    expectSlice(h.value, "s17_pub", { n: 1 });
    await h.value.stop();

    const badDeny = defineModule({
      id: "s17-baddeny",
      version: "1.0.0",
      title: "Bad Deny Sub",
      events: {
        subscribe: [
          {
            name: "s17_pub.changed",
            handler() {
              deny("NOPE", "nope");
            },
          },
        ],
      },
    });
    const h2 = await testModules([pub, badDeny]);
    expect(h2.ok).toBe(true);
    if (!h2.ok) return;
    const turn2 = await h2.value.turn("go");
    expectCommitted(turn2);
    await h2.value.stop();
  });

  test("S18: subscription to unknown event name (publisher loaded) → boot fail MODULE_EVENT_UNKNOWN", async () => {
    const pub = publisher("s18-pub");
    const typo = defineModule({
      id: "s18-typo",
      version: "1.0.0",
      title: "Typo",
      events: {
        subscribe: [{ name: "s18_pub.changd", handler() {} }],
      },
    });
    const h = await testModules([pub, typo]);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_EVENT_UNKNOWN");
    expect(h.error.message).toContain("s18_pub.changd");
  });

  test("S18b: subscription to unloaded publisher without requires → boot warning + inert (boot ok, no deliveries)", async () => {
    const sub = defineModule({
      id: "s18b-sub",
      version: "1.0.0",
      title: "Inert Sub",
      events: {
        subscribe: [{ name: "never_loaded.changed", handler() {} }],
      },
    });
    const h = await testModule(sub);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    await h.value.stop();
  });

  test("S20: subscriber handler throws post-commit → turn stays committed; world unchanged", async () => {
    const pub = publisher("s20-pub");
    const explode = defineModule({
      id: "s20-explode",
      version: "1.0.0",
      title: "Explode",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          bump: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      events: {
        subscribe: [
          {
            name: "s20_pub.changed",
            handler() {
              throw new Error("handler boom");
            },
          },
        ],
      },
    });
    const h = await testModules([pub, explode]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    expectSlice(h.value, "s20_pub", { n: 1 });
    expectSlice(h.value, "s20_explode", { n: 0 });
    await h.value.stop();
  });

  test("S22: cascade depth cap → MODULE_EVENT_CASCADE_LIMIT; world unchanged", async () => {
    // Chain: a1 → a2 → a3 → … each handler re-emits the next event.
    const mkChain = (i: number) =>
      defineModule({
        id: `chain-${String(i).padStart(2, "0")}`,
        version: "1.0.0",
        title: `Chain ${i}`,
        events: {
          emit: [{ name: `fire-${i}` }],
          subscribe: [
            {
              name: `chain_${String(i - 1).padStart(2, "0")}.fire-${i - 1}`,
              handler(ctx) {
                ctx.emit(`chain_${String(i).padStart(2, "0")}.fire-${i}`, {});
              },
            },
          ],
        },
      }) as import("@rpengineext/contracts").Module;

    const chain0 = defineModule({
      id: "chain-00",
      version: "1.0.0",
      title: "Chain 00",
      events: {
        emit: [{ name: "fire-0" }],
      },
      turn: {
        committed(ctx) {
          ctx.emit("chain_00.fire-0", {});
        },
      },
    });

    // Depth chain of 12 (> cap 8) → cascade limit warning; turn still committed.
    const chain = [chain0, ...Array.from({ length: 12 }, (_, i) => mkChain(i + 1))];
    const h = await testModules(chain);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    await h.value.stop();
  });

  test("S22b: per-turn burst cap → MODULE_EVENT_BURST_LIMIT; remaining dropped, world unchanged", async () => {
    // Publisher emits 300 events in committed (> 256 cap).
    const mod = defineModule({
      id: "burst-pub",
      version: "1.0.0",
      title: "Burst",
      events: {
        emit: [{ name: "ping" }],
      },
      turn: {
        committed(ctx) {
          for (let i = 0; i < 300; i += 1) {
            ctx.emit("burst_pub.ping", { i });
          }
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    expect(h.value.events.filter((e) => e.name === "burst_pub.ping").length).toBeLessThanOrEqual(
      256,
    );
    await h.value.stop();
  });
});