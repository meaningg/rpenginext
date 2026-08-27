import { describe, expect, test } from "bun:test";

import {
  defineModule,
  type NarrativeCritique,
} from "../src/index.ts";
import { createTestEngine } from "@rpengineext/core/testing";
import { MockAgentScript } from "@rpengineext/core/testing";
import type { AgentTask, EngineEvent } from "@rpengineext/contracts";

/**
 * SDK-level NarrativeCritic tests (ADR 0008 §5.4 items 10-13).
 */
describe("narrative.critic capability (ADR 0008)", () => {
  function criticModule(options: {
    readonly reject: (
      ctx: { attempt: number; prose: string },
    ) => NarrativeCritique | null | undefined;
    readonly writeInCritic?: boolean;
  }) {
    return defineModule({
      id: "critic-sdk",
      version: "1.0.0",
      title: "Critic SDK",
      narrative: {
        critic(ctx) {
          if (options.writeInCritic) {
            ctx.op("bump", {});
          }
          const meta = ctx.meta as {
            prose?: string;
            attempt?: number;
          };
          return options.reject({
            attempt: meta.attempt ?? 0,
            prose: meta.prose ?? "",
          });
        },
      },
    });
  }

  test("compiles: moments.narrativeCritic + manifest NarrativeCritic contribution", () => {
    const mod = criticModule({ reject: () => null });
    expect(mod.ir).toBeDefined();
    expect(mod.ir?.moments.narrativeCritic).toBe(true);
    expect(mod.ir?.moments.narrativeSystem).toBe(false);
    expect(mod.manifest.contributes).toContain("NarrativeCritic");
  });

  test("null/undefined verdicts are accepted (ok, no rewrite)", async () => {
    let llmCalls = 0;
    const mod = criticModule({ reject: () => null });
    const script = new MockAgentScript().on("narrative.write", (task) => {
      llmCalls += 1;
      return { ok: true, taskId: task.taskId, data: { prose: "Fine prose." } };
    });

    const created = await createTestEngine({ modules: [mod], mockAgentScript: script });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(llmCalls).toBe(1);
    expect(result.passage.prose).toBe("Fine prose.");
  });

  test("reject + retry: repair rounds render into the second LLM request", async () => {
    const llmTexts: string[] = [];
    const mod = criticModule({
      reject: ({ prose }) =>
        prose.includes("Iteration zero") ? { ok: false, reason: "repeats the scene" } : null,
    });
    const script = new MockAgentScript().on("narrative.write", (task) => {
      if (task.repairRounds && task.repairRounds.length > 0) {
        llmTexts.push(task.repairRounds[0]!.issues);
      }
      const first = llmTexts.length === 0;
      return {
        ok: true,
        taskId: task.taskId,
        data: {
          prose: first ? "Iteration zero prose." : "Iteration one prose.",
        },
      };
    });

    const created = await createTestEngine({ modules: [mod], mockAgentScript: script });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.passage.prose).toBe("Iteration one prose.");
    expect(llmTexts).toEqual(["repeats the scene"]);
  });

  test("writing ops in narrative.critic → stable MODULE_MOMENT_OP_FORBIDDEN (read-only)", async () => {
    const mod = criticModule({
      writeInCritic: true,
      reject: () => null,
    });
    const created = await createTestEngine({
      modules: [mod],
      mockAgentScript: new MockAgentScript().fixed("narrative.write", {
        prose: "Prose.",
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.failure.code).toBe("MODULE_MOMENT_OP_FORBIDDEN");
  });

  test("requestAgent opts: round reaches deltas; stream:false suppresses them", async () => {
    // Pipeline path: deltas of the retry carry round 1.
    const mod = criticModule({
      reject: ({ prose }) =>
        prose.includes("first") ? { ok: false, reason: "round 0 bad" } : null,
    });
    const queue = ["first stream", "second stream"];
    const script = new MockAgentScript().on("narrative.write", (task) => {
      const prose = queue.length > 0 ? queue.shift()! : "second stream";
      return { ok: true, taskId: task.taskId, data: { prose } };
    });

    const created = await createTestEngine({ modules: [mod], mockAgentScript: script });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deltas: EngineEvent[] = [];
    const unsub = created.value.events.subscribe("llm.stream.delta", (e) => {
      deltas.push(e);
    });
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({ kind: "free_text", text: "go" });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    unsub();

    const rounds = deltas.map((d) =>
      d.type === "llm.stream.delta" ? (d.round ?? 0) : -1,
    );
    expect(rounds).toContain(0);
    expect(rounds).toContain(1);

    // Direct orchestrator call with stream:false → no deltas.
    const quietCreated = await createTestEngine({
      modules: [mod],
      mockAgentScript: new MockAgentScript().fixed("narrative.write", {
        prose: "Quiet.",
      }),
      agents: { maxNarrativeCriticRetries: 0 },
    });
    expect(quietCreated.ok).toBe(true);
    if (!quietCreated.ok) return;
    const quietDeltas: EngineEvent[] = [];
    const quietUnsub = quietCreated.value.events.subscribe("llm.stream.delta", (e) => {
      quietDeltas.push(e);
    });
    const task: AgentTask = {
      taskId: "sdk-quiet-1",
      type: "narrative.write",
      turnId: "sdk-quiet-turn-1",
      input: {},
      constraints: { timeoutMs: 1000, maxRepairAttempts: 0, optional: false },
      requester: { kind: "core", id: "test" },
    };
    await quietCreated.value.orchestrator.execute(task, undefined, {
      round: 0,
      stream: false,
    });
    quietUnsub();
    expect(quietDeltas).toHaveLength(0);
  });
});