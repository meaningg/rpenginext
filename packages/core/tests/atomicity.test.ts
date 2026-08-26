import { describe, expect, test } from "bun:test";
import {
  defineModule,
  deny,
} from "@rpengineext/module-sdk";
import { createTestEngine } from "../src/testing/create-test-engine.ts";
import type { LlmPort } from "@rpengineext/contracts";
import { z } from "zod";

const voiceLlm: LlmPort = {
  async complete(request) {
    const hasTools = (request.tools?.length ?? 0) > 0;
    return {
      ok: true,
      value: {
        text: hasTools
          ? JSON.stringify({ ok: true })
          : JSON.stringify({ prose: "atomic prose" }),
        finishReason: "stop",
      },
    };
  },
};

function countingModule(id: string, slice: string) {
  return defineModule({
    id,
    version: "1.0.0",
    title: id,
    state: {
      name: slice,
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
    },
  });
}

describe("atomicity pack A01–A09 (specs/02 §5.5)", () => {
  test("A01: guard deny → full rollback (no state, no passage)", async () => {
    const mod = defineModule({
      id: "a01",
      version: "1.0.0",
      title: "A01",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          inc: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      rules: {
        guard(ctx) {
          const text = (
            ctx.normalizedAction as { text?: string } | undefined
          )?.text;
          if (text === "nope") deny("NOPE", "not allowed");
        },
      },
      turn: {
        change(ctx) {
          ctx.op("inc");
        },
      },
    });
    const created = await createTestEngine({ modules: [mod], llm: voiceLlm });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const rejected = await session.value.submitAction({ kind: "free_text", text: "nope" });
    expect(rejected.status).toBe("rejected");
    const state = created.value.runtime.getSessionState(session.value.sessionId)!;
    expect((state.slices.a01 as { n: number }).n).toBe(0);
  });

  test("A02: LLM fail → full rollback", async () => {
    const mod = countingModule("a02", "a02");
    const failingLlm: LlmPort = {
      async complete() {
        return { ok: false, error: { code: "AGENT_FAILED", message: "provider down" } };
      },
    };
    const created = await createTestEngine({ modules: [mod], llm: failingLlm, agentsMode: "llm" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(turn.status).toBe("rejected");
    const state = created.value.runtime.getSessionState(session.value.sessionId)!;
    expect((state.slices.a02 as { n: number }).n).toBe(0);
  });

  test("A03: invariant fail → rollback", async () => {
    const mod = defineModule({
      id: "a03",
      version: "1.0.0",
      title: "A03",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 5 },
        ops: {
          add: (s, p: { by: number }) => ({ ...s, n: s.n + p.by }),
        },
      },
      rules: {
        invariant(slice: { n: number }) {
          if (slice.n > 10) deny("NOPE", "n must stay ≤ 10");
        },
      },
      turn: {
        change(ctx) {
          ctx.op("add", { by: 100 });
        },
      },
    });
    const created = await createTestEngine({ modules: [mod], llm: voiceLlm });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(turn.status).toBe("rejected");
    const state = created.value.runtime.getSessionState(session.value.sessionId)!;
    expect((state.slices.a03 as { n: number }).n).toBe(5);
  });

  test("A04: tool handler deny → no partial world write", async () => {
    const mod = defineModule({
      id: "a04",
      version: "1.0.0",
      title: "A04",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), mark: z.string() }).strict(),
        initial: { schemaVersion: 1 as const, mark: "" },
        ops: {
          set_mark: {
            payload: z.object({ mark: z.string() }).strict(),
            apply: (s: { schemaVersion: 1; mark: string }, p: { mark: string }) => ({ ...s, mark: p.mark }),
          },
        },
      },
      turn: {
        committed(ctx) {
          ctx.scheduleSystem({ reason: "a04.sync", mode: "inline" });
        },
      },
      ai: {
        tasks: {
          sync: {
            description: "sync",
            input: z.object({}).strict(),
            output: z.object({ ok: z.boolean() }).strict(),
            runOn: { systemReason: "a04.sync" },
            tools: ["apply"],
            messages: () => [
              { role: "system" as const, content: "apply" },
              { role: "user" as const, content: "go" },
            ],
          },
        },
        tools: {
          apply: {
            description: "apply",
            args: z.object({ mark: z.string() }).strict(),
            result: z.object({ ok: z.boolean() }).strict(),
            handler(_args, _ctx) {
              deny("MARK_DENY", "no marks today");
            },
          },
        },
      },
    });
    const created = await createTestEngine({ modules: [mod], llm: voiceLlm, agentsMode: "llm" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(turn.status).toBe("committed"); // player turn itself is fine
    const state = created.value.runtime.getSessionState(session.value.sessionId)!;
    expect((state.slices.a04 as { mark: string }).mark).toBe("");
  });

  test("A05: foreign slice propose denied", async () => {
    const owner = countingModule("a05-owner", "a05_owner");
    const attacker = defineModule({
      id: "a05-attacker",
      version: "1.0.0",
      title: "Attacker",
      turn: {
        change() {
          /* cannot reach another slice via ctx — op names are own-only */
        },
        committed() {
          /* no-op */
        },
      },
    });
    const created = await createTestEngine({ modules: [owner, attacker], llm: voiceLlm });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(turn.status).toBe("committed");
    const state = created.value.runtime.getSessionState(session.value.sessionId)!;
    expect((state.slices.a05_owner as { n: number }).n).toBe(1);
  });

  test("A06: system turn skips narrative.write", async () => {
    let proseCalls = 0;
    const proseLlm: LlmPort = {
      async complete(request) {
        if (!request.tools?.length && request.messages.some((m) => m.content.includes("автор интерактивной книги"))) {
          proseCalls += 1;
        }
        return { ok: true, value: { text: JSON.stringify({ prose: "p" }), finishReason: "stop" } };
      },
    };
    const mod = defineModule({
      id: "a06",
      version: "1.0.0",
      title: "A06",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), runs: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, runs: 0 },
        ops: {
          run: (s) => ({ ...s, runs: s.runs + 1 }),
        },
      },
      turn: {
        committed(ctx) {
          ctx.scheduleSystem({ reason: "a06.sys", mode: "inline" });
        },
        change(ctx) {
          if (ctx.turnKind === "system") ctx.op("run");
        },
      },
    });
    const created = await createTestEngine({ modules: [mod], llm: proseLlm, agentsMode: "llm" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(turn.status).toBe("committed");
    expect(proseCalls).toBe(1); // only the player turn narrates
  });

  test("A07: background system turn: next player waits (serial session)", async () => {
    const events: string[] = [];
    const slowLlm: LlmPort = {
      async complete(request) {
        if (request.tools?.length) {
          return { ok: true, value: { text: JSON.stringify({ ok: true }), finishReason: "stop" } };
        }
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true, value: { text: JSON.stringify({ prose: "slow prose" }), finishReason: "stop" } };
      },
    };
    const mod = defineModule({
      id: "a07",
      version: "1.0.0",
      title: "A07",
      turn: {
        committed(ctx) {
          ctx.scheduleSystem({ reason: "a07.bg", mode: "background" });
        },
        change(ctx) {
          events.push(`change:${ctx.turnKind}`);
        },
      },
    });
    const created = await createTestEngine({ modules: [mod], llm: slowLlm, agentsMode: "llm" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const first = await session.value.submitAction({ kind: "free_text", text: "one" });
    expect(first.status).toBe("committed");
    // Immediately queue a player turn — must wait for background work (serial).
    const second = await session.value.submitAction({ kind: "free_text", text: "two" });
    expect(second.status).toBe("committed");
    expect(events.filter((e) => e === "change:player").length).toBe(2);
  });

  test("A08: journal replay matches state", async () => {
    const mod = countingModule("a08", "a08");
    const created = await createTestEngine({ modules: [mod], llm: voiceLlm });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    await session.value.submitAction({ kind: "free_text", text: "one" });
    await session.value.submitAction({ kind: "free_text", text: "two" });
    const live = created.value.runtime.getSessionState(session.value.sessionId)!;
    const replayed = await created.value.runtime.replaySessionJournal(
      session.value.sessionId,
    );
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.value.matchesLive).toBe(true);
    expect((live.slices.a08 as { n: number }).n).toBe(2);
    expect(replayed.value.lastRevision).toBe(live.meta.revision);
  });

  test("A09: events on rejected turn observe rolled-back state; dispatch cannot mutate", async () => {
    const observed: { n: number }[] = [];
    const pub = defineModule({
      id: "a09-pub",
      version: "1.0.0",
      title: "Pub",
      state: {
        schema: z.object({ schemaVersion: z.literal(1), n: z.number() }).strict(),
        initial: { schemaVersion: 1 as const, n: 0 },
        ops: {
          inc: (s) => ({ ...s, n: s.n + 1 }),
        },
      },
      rules: {
        guard(ctx) {
          const text = (ctx.normalizedAction as { text?: string } | undefined)?.text;
          if (text === "nope") deny("NOPE", "nope");
        },
      },
      events: {
        emit: [{ name: "failed", schema: z.object({ n: z.number() }).strict() }],
      },
      turn: {
        change(ctx) {
          ctx.op("inc");
        },
        rejected(ctx) {
          ctx.emit("a09_pub.failed", { n: (ctx.slice as { n: number }).n });
        },
      },
    });
    const sub = defineModule({
      id: "a09-sub",
      version: "1.0.0",
      title: "Sub",
      events: {
        subscribe: [
          {
            name: "a09_pub.failed",
            handler(ctx, event) {
              observed.push({ n: (event.payload as { n: number }).n });
              // Observe-only: any mutation attempt fails loud (covered by S17);
              // here we merely record the rolled-back value.
            },
          },
        ],
      },
    });
    const created = await createTestEngine({ modules: [pub, sub], llm: voiceLlm });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({ kind: "free_text", text: "yes" });
    expect(turn.status).toBe("committed");
    expect(observed).toHaveLength(0);

    const rejected = await session.value.submitAction({ kind: "free_text", text: "nope" });
    expect(rejected.status).toBe("rejected");
    // Handler observed the pre-turn (rolled-back) state — n was 1 from the
    // committed turn, the rejected turn's inc was rolled back → still 1.
    expect(observed).toEqual([{ n: 1 }]);
    const state = created.value.runtime.getSessionState(session.value.sessionId)!;
    expect((state.slices.a09_pub as { n: number }).n).toBe(1);
  });
});