import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  CORE_COMMAND_TYPES,
  ok,
  type Module,
  type ModuleManifest,
  type StateCommand,
  type WorldState,
} from "@rpengineext/contracts";

import { createTestEngine } from "../src/testing/create-test-engine.ts";
import { createCommandId } from "../src/util/ids.ts";
import { createCoreCommandDefinitions } from "../src/state/core-commands.ts";
import { replayJournal } from "../src/state/journal-replay.ts";
import { applySliceMigrations } from "../src/state/slice-migrations.ts";
import { createEmptyWorldState } from "@rpengineext/contracts";

function baseManifest(partial: Partial<ModuleManifest> & Pick<ModuleManifest, "id">): ModuleManifest {
  return {
    version: "0.1.0",
    displayName: partial.id,
    description: "",
    engines: { core: "^0.1.0", contracts: "^0.1.0" },
    priority: 10,
    provides: [],
    requires: ["capability:state-core"],
    permissions: ["state:read", "state:propose:core"],
    stateSlices: [],
    registers: [],
    contributes: [],
    interceptors: [],
    ...partial,
  };
}

describe("phase 4 hardening", () => {
  test("permission denial blocks module propose to foreign slice", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "bad-perms",
        permissions: ["state:read"], // no propose
        contributes: ["TransitionContributor"],
      }),
      register(ctx) {
        ctx.addTransitionContributor({
          contribute() {
            const commands: StateCommand[] = [
              {
                commandId: createCommandId(),
                type: CORE_COMMAND_TYPES.setFlag,
                slice: "core",
                payload: { key: "x", value: true },
                source: { kind: "module", id: "bad-perms" },
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
      text: "hi",
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.failure.code).toBe("PERMISSION_DENIED");
  });

  test("strictManifest rejects undeclared contribution port", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "strict-bad",
        contributes: [], // missing Guard
      }),
      register(ctx) {
        ctx.addGuard({
          check() {
            return ok({ allow: true });
          },
        });
      },
    };

    const created = await createTestEngine({ modules: [mod] });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.message).toContain("strictManifest");
  });

  test("action.interpret path runs when enabled", async () => {
    const created = await createTestEngine({
      // enable via createEngine config merge
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // rebuild with flag
    const { createEngine } = await import("../src/create-engine.ts");
    const { InMemoryPersistence } = await import(
      "../src/persistence/in-memory-persistence.ts"
    );
    const { MemoryTraceSink } = await import("../src/tracing/memory-trace-sink.ts");
    const { createLogger } = await import("@rpengineext/logger");
    const { createDefaultMockAgentScript } = await import(
      "../src/agents/mock-agent-script.ts"
    );

    const eng = await createEngine({
      deps: {
        log: createLogger({ name: "t", level: "error", json: true }),
        persistence: new InMemoryPersistence(),
        traceSink: new MemoryTraceSink(),
      },
      mockAgentScript: createDefaultMockAgentScript(),
      config: {
        agents: {
          mode: "mock",
          enableActionInterpret: true,
          defaultModel: "m",
        },
        logging: { level: "error", json: true },
      },
    });
    expect(eng.ok).toBe(true);
    if (!eng.ok) return;
    const session = await eng.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "wave",
    });
    expect(result.status).toBe("committed");
  });

  test("system turn scheduler queues and drains follow-up system turn", async () => {
    let systemSeen = false;
    const mod: Module = {
      manifest: baseManifest({
        id: "sys-sched",
        contributes: ["SystemTurnScheduler", "TransitionContributor"],
        permissions: ["state:read", "state:propose:core"],
      }),
      register(ctx) {
        ctx.addSystemTurnScheduler({
          schedule() {
            return ok({
              requests: [{ reason: "post-player-cleanup" }],
            });
          },
        });
        ctx.addTransitionContributor({
          contribute({ intent }) {
            if (intent.intentType === "system") {
              systemSeen = true;
              return ok({
                commands: [
                  {
                    commandId: createCommandId(),
                    type: CORE_COMMAND_TYPES.setFlag,
                    slice: "core",
                    payload: { key: "systemRan", value: true },
                    source: { kind: "module", id: "sys-sched" },
                  },
                ],
              });
            }
            return ok({ commands: [] });
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
      text: "go",
    });
    expect(result.status).toBe("committed");
    expect(systemSeen).toBe(true);
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    expect(state?.core.flags.systemRan).toBe(true);
    // player + system each bump
    expect(state?.core.turnIndex).toBe(2);

    // System turn keeps journal passage but does not clobber player lastPassage.
    if (result.status !== "committed") return;
    const last = await session.value.getPassage();
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(last.value?.id).toBe(result.passage.id);
    expect(last.value?.prose).not.toMatch(/^\(system\)/);
  });

  test("conflict resolver merges competing commands", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "conflict-mod",
        registers: ["conflict-key:flag", "command"],
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
            // keep only the last command
            return ok({ commands: [commands[commands.length - 1]!] });
          },
        });
        ctx.addTransitionContributor({
          contribute() {
            return ok({
              commands: [
                {
                  commandId: createCommandId(),
                  type: CORE_COMMAND_TYPES.setFlag,
                  slice: "core",
                  payload: { key: "a", value: 1 },
                  source: { kind: "module", id: "conflict-mod" },
                },
                {
                  commandId: createCommandId(),
                  type: CORE_COMMAND_TYPES.setFlag,
                  slice: "core",
                  payload: { key: "a", value: 2 },
                  source: { kind: "module", id: "conflict-mod" },
                },
              ],
            });
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
    const flagCmds = result.acceptedCommands.filter(
      (c) => c.type === CORE_COMMAND_TYPES.setFlag,
    );
    expect(flagCmds.length).toBe(1);
    expect(flagCmds[0]?.payload.value).toBe(2);
  });

  test("slice migrations upgrade loaded state", () => {
    const state = createEmptyWorldState("t");
    const withSlice: WorldState = {
      ...state,
      slices: {
        demo: { schemaVersion: 1, n: 1 },
      },
    };
    const slices = new Map([
      [
        "demo",
        {
          moduleId: "m",
          priority: 1,
          value: {
            name: "demo",
            schemaVersion: 2,
            schema: z
              .object({
                schemaVersion: z.number(),
                n: z.number(),
                migrated: z.boolean(),
              })
              .passthrough(),
          },
        },
      ],
    ]);
    const migrations = [
      {
        moduleId: "m",
        priority: 1,
        value: {
          slice: "demo",
          fromVersion: 1,
          toVersion: 2,
          migrate(old: { n?: number }) {
            return ok({
              schemaVersion: 2,
              n: Number(old.n ?? 0),
              migrated: true,
            });
          },
        },
      },
    ];
    const result = applySliceMigrations(withSlice, slices as never, migrations as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slices.demo).toEqual({
      schemaVersion: 2,
      n: 1,
      migrated: true,
    });
  });

  test("journal replay rebuilds turn index from commands", () => {
    const initial = createEmptyWorldState("t0");
    const cmds = createCoreCommandDefinitions();
    const entryCommands: StateCommand[] = [
      {
        commandId: "c1",
        type: CORE_COMMAND_TYPES.bumpTurn,
        slice: "core",
        payload: { turnId: "trn_1" },
        source: { kind: "core", id: "test" },
      },
    ];
    const replayed = replayJournal({
      initialState: initial,
      commands: cmds,
      entries: [
        {
          turnId: "trn_1",
          prevRevision: 0,
          nextRevision: 1,
          input: { kind: "free_text", text: "x" },
          commands: entryCommands,
          passageId: "psg_1",
          timestamp: "t1",
        },
      ],
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.value.state.core.turnIndex).toBe(1);
    expect(replayed.value.state.meta.revision).toBe(1);
    expect(replayed.value.appliedEntries).toBe(1);
  });

  test("stage timeout rejects turn before commit", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "slow-guard",
        contributes: ["Guard"],
      }),
      register(ctx) {
        ctx.addGuard({
          async check() {
            await new Promise((r) => setTimeout(r, 50));
            return ok({ allow: true });
          },
        });
      },
    };

    const { createEngine } = await import("../src/create-engine.ts");
    const { InMemoryPersistence } = await import(
      "../src/persistence/in-memory-persistence.ts"
    );
    const { MemoryTraceSink } = await import("../src/tracing/memory-trace-sink.ts");
    const { createLogger } = await import("@rpengineext/logger");
    const { createDefaultMockAgentScript } = await import(
      "../src/agents/mock-agent-script.ts"
    );

    const eng = await createEngine({
      deps: {
        log: createLogger({ name: "t", level: "error", json: true }),
        persistence: new InMemoryPersistence(),
        traceSink: new MemoryTraceSink(),
      },
      modules: [mod],
      mockAgentScript: createDefaultMockAgentScript(),
      config: {
        agents: { mode: "mock", defaultModel: "m" },
        turn: {
          stageTimeoutsMs: {
            begin: 30_000,
            normalize: 30_000,
            intent: 30_000,
            guard: 5,
            plan: 30_000,
            propose: 30_000,
            validate_commands: 30_000,
            narrate: 30_000,
            present: 30_000,
            commit: 30_000,
            after: 30_000,
            end: 30_000,
          },
        },
        logging: { level: "error", json: true },
      },
    });
    expect(eng.ok).toBe(true);
    if (!eng.ok) return;
    const session = await eng.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.submitAction({
      kind: "free_text",
      text: "slow",
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.failure.code).toBe("TIMEOUT");
  });

  test("agent tool invoke + host help surface", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "tools-help",
        registers: ["agent-tool:echo"],
        contributes: ["AgentTool", "HelpProvider"],
        permissions: ["state:read", "rng:use"],
      }),
      register(ctx) {
        ctx.registerAgentTool({
          id: "echo",
          description: "echo",
          argsSchema: z.object({ q: z.string() }).strict() as never,
          resultSchema: z.object({ q: z.string() }).strict() as never,
        });
        ctx.addAgentToolHandler({
          id: "echo",
          description: "echo",
          invoke(args) {
            return ok({ q: String(args.q) });
          },
        });
        ctx.addHelpProvider({
          provide() {
            return ok({
              topics: [{ id: "echo", body: "echo tool help" }],
            });
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

    const { createTurnContext, createCorePermissionChecker } = await import(
      "../src/pipeline/turn-context.ts"
    );
    const ctx = createTurnContext({
      turnId: "trn_x",
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
      log: created.value.config
        ? (await import("@rpengineext/logger")).createLogger({
            name: "x",
            level: "error",
            json: true,
          })
        : (await import("@rpengineext/logger")).createLogger({
            name: "x",
            level: "error",
            json: true,
          }),
      permissions: createCorePermissionChecker(),
    });

    const tool = await created.value.orchestrator.invokeTool(
      "echo",
      { q: "hi" },
      ctx,
    );
    expect(tool.ok).toBe(true);
    if (tool.ok) expect(tool.value.q).toBe("hi");

    const help = await created.value.runtime.getHostSurface().getHelp(ctx);
    expect(help.ok).toBe(true);
    if (help.ok) {
      expect(help.value.some((t) => t.id === "echo")).toBe(true);
    }
  });

  test("status panel provider lands in passage.visibleState", async () => {
    const mod: Module = {
      manifest: baseManifest({
        id: "status-mod",
        contributes: ["StatusPanelProvider"],
      }),
      register(ctx) {
        ctx.addStatusPanelProvider({
          provide() {
            return ok({ lines: [{ slot: "hp", text: "HP 10" }] });
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
      text: "look",
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    const panel = result.passage.visibleState?.statusPanel as
      | { lines?: { text: string }[] }
      | undefined;
    expect(panel?.lines?.[0]?.text).toBe("HP 10");
  });
});
