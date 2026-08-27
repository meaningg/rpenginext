import { describe, expect, test } from "bun:test";

import {
  ok,
  type AgentTask,
  type EngineEvent,
  type Module,
  type ModuleManifest,
} from "@rpengineext/contracts";

import { MockAgentScript } from "../src/agents/mock-agent-script.ts";
import { createTestEngine } from "../src/testing/create-test-engine.ts";

/**
 * Raw test module contributing a NarrativeCritic port (ADR 0008).
 */
function createCriticModule(options: {
  readonly id: string;
  readonly priority?: number;
  /** Returns a reject reason for the given draft, or undefined to accept. */
  readonly reject: (prose: string, attempt: number) => string | undefined;
  /** Observation hook (call order assertions). */
  readonly onCall?: (prose: string, attempt: number) => void;
}): Module {
  const manifest: ModuleManifest = {
    id: options.id,
    version: "1.0.0",
    displayName: `Critic ${options.id}`,
    description: "test critic module",
    engines: { core: "^1.0.0", contracts: "^1.0.0" },
    priority: options.priority ?? 100,
    provides: [],
    requires: ["capability:state-core"],
    permissions: ["state:read"],
    stateSlices: [],
    registers: [],
    contributes: ["NarrativeCritic"],
    interceptors: [],
  };
  return {
    manifest,
    register(ctx) {
      ctx.addNarrativeCritic({
        critique({ prose, attempt }) {
          options.onCall?.(prose, attempt);
          const reason = options.reject(prose, attempt);
          if (reason) return ok({ ok: false, reason });
          return ok({ ok: true });
        },
      });
    },
  };
}

describe("narrative critic loop (ADR 0008)", () => {
  test("round-trip: bad draft rejected → repair round → good draft accepted", async () => {
    const drafts = ["Rejected draft one.", "Good final draft."];
    const seenTasks: AgentTask[] = [];
    const script = new MockAgentScript().on("narrative.write", (task) => {
      seenTasks.push(task);
      return {
        ok: true,
        taskId: task.taskId,
        data: { prose: drafts[seenTasks.length - 1]! },
      };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-prose",
          reject: (prose) => (prose.startsWith("Rejected") ? "prose repeats the previous outcome" : undefined),
        }),
      ],
      mockAgentScript: script,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "look around",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.passage.prose).toBe("Good final draft.");

    // Second call carried the semantic repair round (assistant = failed prose,
    // user = critic reasons) — ADR 0008 transport.
    expect(seenTasks).toHaveLength(2);
    const repairRounds = seenTasks[1]?.repairRounds;
    expect(repairRounds).toHaveLength(1);
    expect(repairRounds?.[0]?.prose).toBe("Rejected draft one.");
    expect(repairRounds?.[0]?.issues).toContain("prose repeats the previous outcome");

    // Trace audit: criticRounds = last round index, rejected round reasons.
    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("### Critic results");
    expect(md).toContain("criticRounds: 1");
    expect(md).toContain("criticAccepted: false");
    expect(md).toContain("**Round 0**");
    expect(md).toContain("- prose repeats the previous outcome");
  });

  test("budget + accept (default): 3 bad drafts at maxNarrativeCriticRetries: 2 commits last draft", async () => {
    const queue = ["Bad one.", "Bad two.", "Bad three."];
    const scripted = new MockAgentScript().on("narrative.write", (task) => {
      const prose = queue.length > 0 ? queue.shift()! : "Fallback.";
      return { ok: true, taskId: task.taskId, data: { prose } };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-always",
          reject: () => "still repeating the scene",
        }),
      ],
      mockAgentScript: scripted,
      agents: { maxNarrativeCriticRetries: 2 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    // 3 calls total (initial + 2 retries), the last draft is committed.
    expect(result.passage.prose).toBe("Bad three.");

    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("criticRounds: 2");
    expect(md).toContain("criticAccepted: true");
    expect(md).toContain("**Round 0**");
    expect(md).toContain("**Round 2**");
    expect(md).toContain("_Budget exhausted");
  });

  test("budget + fail: criticPolicy fail → AGENT_FAILED with causedBy, no state change", async () => {
    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-strict",
          reject: () => "hard continuity lock",
        }),
      ],
      mockAgentScript: new MockAgentScript().fixed("narrative.write", {
        prose: "Any draft.",
      }),
      agents: { maxNarrativeCriticRetries: 2, criticPolicy: "fail" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { engine, runtime, persistence } = created.value;
    const session = await engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const before = runtime.getSessionState(session.value.sessionId);
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.failure.code).toBe("AGENT_FAILED");
    expect(result.failure.message).toContain("hard continuity lock");
    expect(result.failure.causedBy).toEqual(["critic-strict"]);

    const after = runtime.getSessionState(session.value.sessionId);
    expect(after?.meta.revision).toBe(before?.meta.revision);

    const journal = await persistence.readJournal(session.value.sessionId);
    expect(journal.ok).toBe(true);
    if (journal.ok) {
      expect(journal.value).toHaveLength(0);
    }
  });

  test("attempt is visible to the critic (loosens on last round)", async () => {
    const queue = ["Weak draft one.", "Weak draft two.", "Final prose."];
    const script = new MockAgentScript().on("narrative.write", (task) => {
      const prose = queue.length > 0 ? queue.shift()! : "Final prose.";
      return { ok: true, taskId: task.taskId, data: { prose } };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-attempt",
          // Reject only while attempt < 2 — round 2 (attempt=2) passes.
          reject: (_prose, attempt) =>
            attempt < 2 ? "needs another revision" : undefined,
        }),
      ],
      mockAgentScript: script,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.passage.prose).toBe("Final prose.");

    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("criticRounds: 2");
    expect(md).toContain("criticAccepted: false");
  });

  test("multiple critics: all reasons collected into the repair message", async () => {
    const queue = ["Draft one.", "Draft two."];
    const seenTasks: AgentTask[] = [];
    const scripted = new MockAgentScript().on("narrative.write", (task) => {
      seenTasks.push(task);
      const prose = queue.length > 0 ? queue.shift()! : "Draft two.";
      return { ok: true, taskId: task.taskId, data: { prose } };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-a",
          reject: () => "critic-a reason",
        }),
        createCriticModule({
          id: "critic-b",
          reject: () => "critic-b reason",
        }),
      ],
      mockAgentScript: scripted,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    const repairRounds = seenTasks[1]?.repairRounds;
    expect(repairRounds).toHaveLength(1);
    expect(repairRounds?.[0]?.issues).toContain("critic-a reason");
    expect(repairRounds?.[0]?.issues).toContain("critic-b reason");

    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("- critic-a reason");
    expect(md).toContain("- critic-b reason");
  });

  test("critic order: priority asc", async () => {
    const order: string[] = [];
    const queue = ["First.", "Second."];
    const scripted = new MockAgentScript().on("narrative.write", (task) => {
      const prose = queue.length > 0 ? queue.shift()! : "Second.";
      return { ok: true, taskId: task.taskId, data: { prose } };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-late",
          priority: 200,
          onCall: () => order.push("critic-late"),
          reject: () => "late reason",
        }),
        createCriticModule({
          id: "critic-early",
          priority: 10,
          onCall: () => order.push("critic-early"),
          reject: () => "early reason",
        }),
      ],
      mockAgentScript: scripted,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    // Both critics are consulted on every round (budget 2 → 3 rounds);
    // within each round the order is priority asc.
    expect(order).toEqual([
      "critic-early",
      "critic-late",
      "critic-early",
      "critic-late",
      "critic-early",
      "critic-late",
    ]);
  });

  test("maxNarrativeCriticRetries: 0 → reject → policy (accept) without rewrite", async () => {
    let calls = 0;
    const scripted = new MockAgentScript().on("narrative.write", (task) => {
      calls += 1;
      return { ok: true, taskId: task.taskId, data: { prose: "Draft." } };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-hard-qa",
          reject: () => "hard QA reject",
        }),
      ],
      mockAgentScript: scripted,
      agents: { maxNarrativeCriticRetries: 0 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(result.status).toBe("committed"); // policy "accept" (default)
    if (result.status !== "committed") return;
    expect(calls).toBe(1);

    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("criticRounds: 0");
    expect(md).toContain("criticAccepted: true");
  });

  test("streaming rounds: deltas carry round markers; stream:false suppresses deltas", async () => {
    const queue = ["Streamed one.", "Streamed two."];
    const scripted = new MockAgentScript().on("narrative.write", (task) => {
      const prose = queue.length > 0 ? queue.shift()! : "Streamed two.";
      return { ok: true, taskId: task.taskId, data: { prose } };
    });

    const created = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-stream",
          reject: (prose) => (prose.includes("one") ? "rejected round 0" : undefined),
        }),
      ],
      mockAgentScript: scripted,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deltas: EngineEvent[] = [];
    const unsubscribe = created.value.events.subscribe("llm.stream.delta", (e) => {
      deltas.push(e);
    });

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    unsubscribe();
    expect(deltas.length).toBeGreaterThan(0);
    const rounds = deltas.map((d) =>
      d.type === "llm.stream.delta" ? (d.round ?? 0) : -1,
    );
    expect(rounds).toContain(0);
    expect(rounds).toContain(1);

    // stream: false per-call → no deltas at all.
    const quiet = new MockAgentScript().fixed("narrative.write", { prose: "Quiet." });
    const quietCreated = await createTestEngine({
      modules: [
        createCriticModule({
          id: "critic-quiet",
          reject: () => "never matters",
        }),
      ],
      mockAgentScript: quiet,
      agents: { maxNarrativeCriticRetries: 0 },
    });
    expect(quietCreated.ok).toBe(true);
    if (!quietCreated.ok) return;

    const quietDeltas: EngineEvent[] = [];
    const quietUnsub = quietCreated.value.events.subscribe("llm.stream.delta", (e) => {
      quietDeltas.push(e);
    });
    const task: AgentTask = {
      taskId: "quiet-task-1",
      type: "narrative.write",
      turnId: "quiet-turn-1",
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

  test("no critics registered → no critic section in the trace (setup-independent)", async () => {
    const created = await createTestEngine({});
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).not.toContain("### Critic results");
  });
});