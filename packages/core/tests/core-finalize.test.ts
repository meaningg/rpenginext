import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  CORE_COMMAND_TYPES,
  ok,
  type AgentTask,
  type Module,
  type ModuleManifest,
  type StateCommand,
} from "@rpengineext/contracts";
import { createLogger } from "@rpengineext/logger";

import { createEngine } from "../src/create-engine.ts";
import {
  createModulePermissionChecker,
  createTurnContext,
} from "../src/pipeline/turn-context.ts";
import {
  commandTouchesConflictKey,
  globPathMatch,
} from "../src/pipeline/conflict-paths.ts";
import { InMemoryPersistence } from "../src/persistence/in-memory-persistence.ts";
import { MemoryTraceSink } from "../src/tracing/memory-trace-sink.ts";
import { createTestEngine } from "../src/testing/create-test-engine.ts";
import { createCommandId, createTaskId } from "../src/util/ids.ts";
import { MockAgentScript } from "../src/agents/mock-agent-script.ts";

function baseManifest(
  partial: Partial<ModuleManifest> & Pick<ModuleManifest, "id">,
): ModuleManifest {
  return {
    version: "0.1.0",
    displayName: partial.id,
    description: "",
    engines: { core: "^0.1.0", contracts: "^0.1.0" },
    priority: 10,
    provides: [],
    requires: ["capability:state-core"],
    permissions: ["state:read", "state:propose:core", "agent:call:*"],
    stateSlices: [],
    registers: [],
    contributes: [],
    interceptors: [],
    ...partial,
  };
}

describe("core finalize wiring", () => {
  test("glob path and conflict key matching", () => {
    expect(globPathMatch("flags.a", "flags.*")).toBe(true);
    expect(globPathMatch("flags.a", "clock")).toBe(false);
    expect(
      commandTouchesConflictKey(
        {
          commandId: "c1",
          type: CORE_COMMAND_TYPES.setFlag,
          slice: "core",
          payload: { key: "a", value: 1 },
          source: { kind: "core", id: "t" },
        },
        { id: "flags", slice: "core", path: "flags.*" },
      ),
    ).toBe(true);
    expect(
      commandTouchesConflictKey(
        {
          commandId: "c2",
          type: CORE_COMMAND_TYPES.bumpTurn,
          slice: "core",
          payload: { turnId: "t" },
          source: { kind: "core", id: "t" },
        },
        { id: "flags", slice: "core", path: "flags.*" },
      ),
    ).toBe(false);
  });

  test("AgentTaskContributor on narrate runs before narrative.write", async () => {
    const seen: string[] = [];
    const script = new MockAgentScript()
      .on("npc.voice", async (task) => {
        seen.push("npc.voice");
        return {
          ok: true,
          taskId: task.taskId,
          data: { line: "hi" },
        };
      })
      .on("narrative.write", async (task) => {
        seen.push("narrative.write");
        return {
          ok: true,
          taskId: task.taskId,
          data: {
            prose: "A voice speaks.",
            choiceDrafts: [],
          },
        };
      });

    const mod: Module = {
      manifest: baseManifest({
        id: "narrate-tasks",
        contributes: ["AgentTaskContributor"],
        permissions: ["state:read", "agent:call:*"],
      }),
      register(ctx) {
        ctx.addAgentTaskContributor({
          contribute({ stage }) {
            if (stage !== "narrate") return ok({ tasks: [] });
            const task: AgentTask = {
              taskId: createTaskId(),
              type: "npc.voice",
              turnId: "pending",
              input: {},
              constraints: {
                timeoutMs: 1000,
                maxRepairAttempts: 0,
                optional: false,
              },
              requester: { kind: "module", id: "narrate-tasks" },
            };
            return ok({ tasks: [task] });
          },
        });
      },
    };

    const created = await createTestEngine({
      modules: [mod],
      mockAgentScript: script,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "listen",
    });
    expect(result.status).toBe("committed");
    expect(seen).toEqual(["npc.voice", "narrative.write"]);
  });

  test("interceptor enqueueAgentTask before propose is drained", async () => {
    const seen: string[] = [];
    const script = new MockAgentScript()
      .on("side.job", async (task) => {
        seen.push("side.job");
        return { ok: true, taskId: task.taskId, data: { ok: true } };
      })
      .on("narrative.write", async (task) => ({
        ok: true,
        taskId: task.taskId,
        data: { prose: "Done.", choiceDrafts: [] },
      }));

    const mod: Module = {
      manifest: baseManifest({
        id: "enq-propose",
        contributes: [],
        interceptors: [{ stage: "propose", when: "before" }],
        permissions: ["state:read", "agent:call:*"],
      }),
      register(ctx) {
        ctx.addInterceptor({
          stage: "propose",
          when: "before",
          handle() {
            return ok({
              type: "enqueueAgentTask",
              task: {
                taskId: createTaskId(),
                type: "side.job",
                turnId: "x",
                input: {},
                constraints: {
                  timeoutMs: 1000,
                  maxRepairAttempts: 0,
                  optional: false,
                },
                requester: { kind: "module", id: "enq-propose" },
              },
            });
          },
        });
      },
    };

    const created = await createTestEngine({
      modules: [mod],
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
    expect(seen).toContain("side.job");
  });

  test("module-scoped tool permission is enforced", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "tool-perm",
        registers: ["agent-tool:secret"],
        contributes: ["AgentTool"],
        permissions: ["state:read"],
      }),
      register(ctx) {
        ctx.registerAgentTool({
          id: "secret",
          description: "secret",
          argsSchema: z.object({}).strict() as never,
          resultSchema: z.object({ ok: z.boolean() }).strict() as never,
          permission: "rng:use",
        });
        ctx.addAgentToolHandler({
          id: "secret",
          description: "secret",
          invoke() {
            return ok({ ok: true });
          },
        });
      },
    };

    const created = await createTestEngine({ modules: [mod] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const deniedCtx = createTurnContext({
      turnId: "t",
      sessionId: session.value.sessionId,
      getStateView: () =>
        created.value.runtime.getSessionState(session.value.sessionId)!,
      propose: () => ok(undefined),
      requestAgent: async (task) => ({
        ok: false,
        taskId: task.taskId,
        error: { code: "n/a", message: "n/a" },
      }),
      note: () => undefined,
      extras: {},
      log: createLogger({ name: "x", level: "error", json: true }),
      permissions: createModulePermissionChecker(["state:read"]),
    });

    const denied = await created.value.orchestrator.invokeTool(
      "secret",
      {},
      deniedCtx,
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("PERMISSION_DENIED");

    const allowed = await created.value.orchestrator.invokeTool(
      "secret",
      {},
      createTurnContext({
        turnId: "t2",
        sessionId: session.value.sessionId,
        getStateView: () =>
          created.value.runtime.getSessionState(session.value.sessionId)!,
        propose: () => ok(undefined),
        requestAgent: async (task) => ({
          ok: false,
          taskId: task.taskId,
          error: { code: "n/a", message: "n/a" },
        }),
        note: () => undefined,
        extras: {},
        log: createLogger({ name: "x", level: "error", json: true }),
        permissions: createModulePermissionChecker(["state:read", "rng:use"]),
      }),
    );
    expect(allowed.ok).toBe(true);
  });

  test("moduleConfig schema validation fails boot", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "cfg-mod",
        registers: ["config:cfg-mod"],
      }),
      register(ctx) {
        ctx.registerConfigSchema({
          key: "cfg-mod",
          schema: z
            .object({ enabled: z.boolean() })
            .strict() as never,
        });
      },
    };

    const bad = await createEngine({
      deps: {
        log: createLogger({ name: "t", level: "error", json: true }),
        persistence: new InMemoryPersistence(),
        traceSink: new MemoryTraceSink(),
      },
      modules: [mod],
      config: {
        moduleConfig: {
          "cfg-mod": { enabled: "yes" as unknown as boolean },
        },
        logging: { level: "error", json: true },
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.message).toContain("moduleConfig");
    }

    const good = await createEngine({
      deps: {
        log: createLogger({ name: "t", level: "error", json: true }),
        persistence: new InMemoryPersistence(),
        traceSink: new MemoryTraceSink(),
      },
      modules: [mod],
      config: {
        moduleConfig: {
          "cfg-mod": { enabled: true },
        },
        logging: { level: "error", json: true },
      },
    });
    expect(good.ok).toBe(true);
  });

  test("LLM repair path consumes OutputRepairHintProvider hints", async () => {
    let n = 0;
    let sawHint = false;
    const llm = {
      async complete(req: { messages: { content: string }[] }) {
        n += 1;
        const last = req.messages[req.messages.length - 1]?.content ?? "";
        if (last.includes("use field prose")) {
          sawHint = true;
        }
        if (n === 1) {
          return ok({
            text: JSON.stringify({ notProse: true }),
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          });
        }
        return ok({
          text: JSON.stringify({
            prose: "Repaired with hints.",
            choiceDrafts: [],
          }),
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        });
      },
    };

    const mod: Module = {
      manifest: baseManifest({
        id: "hint-mod",
        contributes: ["OutputRepairHintProvider"],
      }),
      register(ctx) {
        ctx.addOutputRepairHintProvider({
          provide({ taskType }) {
            if (taskType !== "narrative.write") return ok({ hints: [] });
            return ok({ hints: ["use field prose"] });
          },
        });
      },
    };

    const created = await createTestEngine({
      modules: [mod],
      llm: llm as never,
      agentsMode: "llm",
      defaultModel: "test",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "hi",
    });
    expect(result.status).toBe("committed");
    expect(sawHint).toBe(true);
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test("memory kind validation via HostSurface", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "mem-mod",
        registers: ["memory-kind:note"],
      }),
      register(ctx) {
        ctx.registerMemoryKind({
          kind: "note",
          schema: z
            .object({ text: z.string().min(1) })
            .strict() as never,
        });
      },
    };
    const created = await createTestEngine({ modules: [mod] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const surface = created.value.runtime.getHostSurface();
    expect(surface.listMemoryKinds()).toContain("note");
    expect(surface.validateMemory("note", { text: "ok" }).ok).toBe(true);
    expect(surface.validateMemory("note", { text: "" }).ok).toBe(false);
    expect(surface.validateMemory("missing", { text: "x" }).ok).toBe(false);
  });

  test("conflict path does not merge unrelated core commands", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "path-conflict",
        registers: ["conflict-key:flag"],
        contributes: ["TransitionContributor", "ConflictResolver"],
        permissions: ["state:read", "state:propose:core"],
      }),
      register(ctx) {
        ctx.registerConflictKey({
          id: "flag",
          slice: "core",
          path: "flags.*",
        });
        ctx.addConflictResolver({
          resolve({ commands }) {
            return ok({ commands: [commands[commands.length - 1]!] });
          },
        });
        ctx.addTransitionContributor({
          contribute() {
            const commands: StateCommand[] = [
              {
                commandId: createCommandId(),
                type: CORE_COMMAND_TYPES.setFlag,
                slice: "core",
                payload: { key: "a", value: 1 },
                source: { kind: "module", id: "path-conflict" },
              },
              {
                commandId: createCommandId(),
                type: CORE_COMMAND_TYPES.setClock,
                slice: "core",
                payload: { clock: "noon" },
                source: { kind: "module", id: "path-conflict" },
              },
            ];
            return ok({ commands });
          },
        });
      },
    };

    const created = await createTestEngine({ modules: [mod] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "x",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    // setFlag + setClock + bumpTurn should all survive (no false conflict)
    const types = result.acceptedCommands.map((c) => c.type).sort();
    expect(types).toContain(CORE_COMMAND_TYPES.setFlag);
    expect(types).toContain(CORE_COMMAND_TYPES.setClock);
    expect(types).toContain(CORE_COMMAND_TYPES.bumpTurn);
  });
});
