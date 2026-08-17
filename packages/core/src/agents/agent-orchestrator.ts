import {
  STANDARD_AGENT_TASK_TYPES,
  agentCallPermission,
  err,
  failure,
  hasPermission,
  ok,
  type AgentResult,
  type AgentTask,
  type AgentTaskTypeDefinition,
  type EventBusPort,
  type Failure,
  type JsonObject,
  type LlmPort,
  type PermissionToken,
  type Result,
  type TurnContext,
  type TurnLogger,
  NarrativeWriteOutputSchema,
  ActionInterpretOutputSchema,
} from "@rpengineext/contracts";
import type { z } from "zod";

import type { ContributionIndex } from "../registry/contribution-index.ts";
import type { Clock } from "../util/clock.ts";
import {
  createDefaultMockAgentScript,
  type MockAgentScript,
} from "./mock-agent-script.ts";
import { StandardTaskLlmAdapter } from "./standard-task-llm-adapter.ts";
import { narrativeProseDelta } from "./stream-prose.ts";
import { runToolCallingTask } from "./tool-loop.ts";

export type AgentsRuntimeMode = "mock" | "llm";

export interface AgentOrchestratorOptions {
  readonly log: TurnLogger;
  readonly clock: Clock;
  readonly events?: EventBusPort;
  readonly llm?: LlmPort;
  readonly index: ContributionIndex;
  readonly mockScript?: MockAgentScript;
  readonly maxRepairAttempts?: number;
  /** mock = prefer scripts; llm = use LlmPort for standard tasks. */
  readonly mode?: AgentsRuntimeMode;
  /** Model alias/name for LLM path (from host config/env). */
  readonly defaultModel?: string;
  readonly defaultTemperature?: number;
  readonly maxParallelPerTurn?: number;
  /** Resolves module grants for tool permission checks. */
  readonly getModulePermissions?: (
    moduleId: string,
  ) => readonly PermissionToken[];
  /** Prefer LlmPort streaming and emit draft deltas. */
  readonly streaming?: boolean;
}

export interface ToolInvokeRecord {
  readonly toolName: string;
  readonly callId: string;
  readonly args: JsonObject;
  readonly result?: JsonObject;
  readonly error?: string;
  readonly durationMs: number;
}

/**
 * Single door for agent/LLM tasks and allowlisted tools.
 */
export class AgentOrchestrator {
  private readonly log: TurnLogger;
  private readonly clock: Clock;
  private readonly events?: EventBusPort;
  private readonly llm?: LlmPort;
  private readonly index: ContributionIndex;
  private mockScript: MockAgentScript;
  private readonly maxRepairAttempts: number;
  private readonly mode: AgentsRuntimeMode;
  private readonly llmAdapter: StandardTaskLlmAdapter | undefined;
  private readonly maxParallelPerTurn: number;
  private readonly getModulePermissions?: (
    moduleId: string,
  ) => readonly PermissionToken[];
  private readonly streaming: boolean;
  private readonly defaultModel: string;
  private readonly defaultTemperature?: number;
  /** Raw narrative.write stream buffers keyed by taskId (for prose extraction). */
  private readonly narrativeStreamBuffers = new Map<string, string>();
  private lastToolCalls: ToolInvokeRecord[] = [];
  /** Active turn context for repair-hint providers (set by pipeline). */
  private activeCtx: TurnContext | null = null;

  /**
   * @param options - orchestrator dependencies
   */
  constructor(options: AgentOrchestratorOptions) {
    this.log = options.log.child({ component: "agent-orchestrator" });
    this.clock = options.clock;
    this.events = options.events;
    this.llm = options.llm;
    this.index = options.index;
    this.mockScript = options.mockScript ?? createDefaultMockAgentScript();
    this.maxRepairAttempts = options.maxRepairAttempts ?? 1;
    this.mode = options.mode ?? (options.llm ? "llm" : "mock");
    this.maxParallelPerTurn = Math.max(1, options.maxParallelPerTurn ?? 4);
    this.getModulePermissions = options.getModulePermissions;
    this.streaming = options.streaming ?? true;
    this.defaultModel = options.defaultModel?.trim() || "unspecified";
    this.defaultTemperature = options.defaultTemperature;
    this.llmAdapter = options.llm
      ? new StandardTaskLlmAdapter({
          llm: options.llm,
          model: this.defaultModel,
          log: this.log,
          defaultTemperature: options.defaultTemperature,
        })
      : undefined;
  }

  /**
   * Replaces the mock script (tests/CLI).
   *
   * @param script - mock script
   */
  setMockScript(script: MockAgentScript): void {
    this.mockScript = script;
  }

  /**
   * Returns the active mock script.
   */
  getMockScript(): MockAgentScript {
    return this.mockScript;
  }

  /**
   * Active agents mode.
   */
  getMode(): AgentsRuntimeMode {
    return this.mode;
  }

  /**
   * Tool calls recorded since last {@link beginTurn} / drain.
   */
  drainToolCalls(): ToolInvokeRecord[] {
    const calls = this.lastToolCalls;
    this.lastToolCalls = [];
    return calls;
  }

  /**
   * Resets per-turn agent bookkeeping and binds turn context for repair hints.
   *
   * @param ctx - optional active turn context
   */
  beginTurn(ctx?: TurnContext): void {
    this.lastToolCalls = [];
    this.activeCtx = ctx ?? null;
  }

  /**
   * Updates the active turn context mid-turn (after ctx is fully built).
   *
   * @param ctx - turn context
   */
  setTurnContext(ctx: TurnContext): void {
    this.activeCtx = ctx;
  }

  /**
   * Clears active turn context after turn end.
   */
  endTurn(): void {
    this.activeCtx = null;
  }

  /**
   * Executes many agent tasks with a concurrency limit.
   *
   * @param tasks - tasks to run
   * @param ctx - optional turn context for permissions/repair
   */
  async executeMany(
    tasks: readonly AgentTask[],
    ctx?: TurnContext,
  ): Promise<AgentResult[]> {
    if (tasks.length === 0) return [];
    if (ctx) this.activeCtx = ctx;
    const results: AgentResult[] = new Array(tasks.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(this.maxParallelPerTurn, tasks.length) },
      async () => {
        while (true) {
          const index = next++;
          if (index >= tasks.length) return;
          results[index] = await this.execute(tasks[index]!, ctx);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  /**
   * Invokes a registered agent tool (schema + permission checked).
   *
   * @param toolId - tool id
   * @param args - tool arguments
   * @param ctx - turn context (caller permissions)
   * @param allowlist - optional per-task allowlist
   */
  async invokeTool(
    toolId: string,
    args: JsonObject,
    ctx: TurnContext,
    allowlist?: readonly string[],
  ): Promise<Result<JsonObject, Failure>> {
    const started = this.clock.nowMs();
    const callId = `tool_${toolId}_${started}`;
    if (allowlist && !allowlist.includes(toolId)) {
      return this.toolFail(
        toolId,
        callId,
        args,
        started,
        failure(
          "PERMISSION_DENIED",
          `tool ${toolId} is not on the task allowlist`,
        ),
      );
    }

    const owned = this.index.agentTools.get(toolId);
    const def = owned?.value;
    if (!def) {
      return this.toolFail(
        toolId,
        callId,
        args,
        started,
        failure("INTERNAL", `unknown agent tool: ${toolId}`),
      );
    }

    if (def.permission) {
      const token = def.permission as PermissionToken;
      if (!ctx.permissions.allows(token)) {
        return this.toolFail(
          toolId,
          callId,
          args,
          started,
          failure(
            "PERMISSION_DENIED",
            `missing permission ${def.permission} for tool ${toolId}`,
          ),
        );
      }
    }

    const parsedArgs = def.argsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return this.toolFail(
        toolId,
        callId,
        args,
        started,
        failure("SCHEMA_INVALID", `invalid args for tool ${toolId}`, {
          details: parsedArgs.error.flatten(),
        }),
      );
    }

    const handler = this.index.agentToolHandlers.find(
      (item) => item.value.id === toolId,
    );
    if (!handler) {
      return this.toolFail(
        toolId,
        callId,
        args,
        started,
        failure("INTERNAL", `no handler registered for tool ${toolId}`),
      );
    }

    try {
      const invoked = await handler.value.invoke(parsedArgs.data, ctx);
      if (!invoked.ok) {
        this.lastToolCalls.push({
          toolName: toolId,
          callId,
          args: parsedArgs.data,
          error: invoked.error.message,
          durationMs: this.clock.nowMs() - started,
        });
        return invoked;
      }
      const parsedResult = def.resultSchema.safeParse(invoked.value);
      if (!parsedResult.success) {
        return this.toolFail(
          toolId,
          callId,
          parsedArgs.data,
          started,
          failure("SCHEMA_INVALID", `tool ${toolId} returned invalid result`, {
            details: parsedResult.error.flatten(),
          }),
        );
      }
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args: parsedArgs.data,
        result: parsedResult.data,
        durationMs: this.clock.nowMs() - started,
      });
      return ok(parsedResult.data);
    } catch (error) {
      return this.toolFail(
        toolId,
        callId,
        parsedArgs.data,
        started,
        failure("MODULE_ERROR", `tool ${toolId} threw`, {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Collects repair hints from module providers.
   *
   * @param taskType - agent task type
   * @param schemaError - schema error text
   * @param ctx - turn context
   */
  async collectRepairHints(
    taskType: string,
    schemaError: string,
    ctx: TurnContext,
  ): Promise<string[]> {
    const hints: string[] = [];
    for (const owned of this.index.outputRepairHintProviders) {
      try {
        const result = await owned.value.provide({ taskType, schemaError }, ctx);
        if (result.ok) hints.push(...result.value.hints);
      } catch {
        /* ignore provider errors during repair */
      }
    }
    return hints;
  }

  /**
   * Executes an agent task with schema validation.
   *
   * @param task - agent task
   * @param ctx - optional turn context
   */
  async execute(task: AgentTask, ctx?: TurnContext): Promise<AgentResult> {
    if (ctx) this.activeCtx = ctx;
    const started = this.clock.nowMs();
    this.log.info(
      {
        taskId: task.taskId,
        type: task.type,
        mode: this.mode,
        requester: task.requester,
      },
      "agent task start",
    );
    this.emitStarted(task);

    if (
      task.requester.kind === "module" &&
      this.getModulePermissions &&
      !hasPermission(
        this.getModulePermissions(task.requester.id),
        agentCallPermission(task.type),
      )
    ) {
      this.emitFinished(task, false);
      const denied: AgentResult = {
        ok: false,
        taskId: task.taskId,
        error: {
          code: "PERMISSION_DENIED",
          message: `module ${task.requester.id} lacks ${agentCallPermission(task.type)}`,
        },
      };
      this.logAgentFinished(task, denied, started);
      return denied;
    }

    try {
      const raw = await this.invoke(task);
      if (!raw.ok) {
        this.emitFinished(task, false);
        this.logAgentFinished(task, raw, started);
        return raw;
      }

      const validated = this.validateOutput(task, raw.data);
      if (!validated.ok) {
        if (this.mode === "mock" && this.maxRepairAttempts > 0) {
          const retry = await this.invoke(task);
          if (retry.ok) {
            const again = this.validateOutput(task, retry.data);
            if (again.ok) {
              this.emitFinished(task, true);
              const repaired: AgentResult = {
                ok: true,
                taskId: task.taskId,
                data: again.value,
                usage: retry.usage,
                rawMeta: {
                  ...(retry.rawMeta ?? {}),
                  durationMs: this.clock.nowMs() - started,
                  repaired: true,
                },
              };
              this.logAgentFinished(task, repaired, started);
              return repaired;
            }
          }
        }
        this.emitFinished(task, false);
        const invalid: AgentResult = {
          ok: false,
          taskId: task.taskId,
          error: {
            code: "SCHEMA_INVALID",
            message: validated.error.message,
            details: validated.error.details,
          },
          rawMeta: raw.rawMeta,
        };
        this.logAgentFinished(task, invalid, started);
        return invalid;
      }

      this.emitFinished(task, true);
      const success: AgentResult = {
        ok: true,
        taskId: task.taskId,
        data: validated.value,
        usage: raw.usage,
        rawMeta: {
          ...(raw.rawMeta ?? {}),
          durationMs: this.clock.nowMs() - started,
        },
      };
      this.logAgentFinished(task, success, started);
      return success;
    } catch (error) {
      this.emitFinished(task, false);
      const thrown: AgentResult = {
        ok: false,
        taskId: task.taskId,
        error: {
          code: "AGENT_INTERNAL",
          message: "agent execution threw",
          details: String(error),
        },
      };
      this.logAgentFinished(task, thrown, started);
      return thrown;
    }
  }

  /**
   * Structured terminal log for one agent task (visible in host/API stdout).
   *
   * @param task - executed task
   * @param result - terminal agent result
   * @param started - clock ms at task start
   */
  private logAgentFinished(
    task: AgentTask,
    result: AgentResult,
    started: number,
  ): void {
    const durationMs = this.clock.nowMs() - started;
    if (result.ok) {
      this.log.info(
        {
          taskId: task.taskId,
          type: task.type,
          durationMs,
          repaired: result.rawMeta?.repaired === true,
        },
        "agent task finished",
      );
      return;
    }
    this.log.warn(
      {
        taskId: task.taskId,
        type: task.type,
        durationMs,
        code: result.error.code,
        message: result.error.message,
      },
      "agent task failed",
    );
  }

  private async invoke(task: AgentTask): Promise<AgentResult> {
    const repairOpts = {
      getRepairHints: async (taskType: string, schemaError: string) => {
        if (!this.activeCtx) return [] as string[];
        return this.collectRepairHints(taskType, schemaError, this.activeCtx);
      },
    };

    const streamOpts = {
      ...repairOpts,
      streaming: this.streaming,
      onDelta: (text: string) => this.emitStreamDelta(task, text),
    };

    if (this.mode === "mock") {
      const mock = this.mockScript.get(task.type);
      if (mock) {
        const result = await mock(task);
        if (result.ok && this.streaming) {
          await this.emitMockStream(task, result.data);
        }
        return result;
      }
      if (this.llmAdapter?.supports(task.type)) {
        return await this.llmAdapter.execute(
          withDefaultRepairs(task, this.maxRepairAttempts),
          streamOpts,
        );
      }
      return {
        ok: false,
        taskId: task.taskId,
        error: {
          code: "NO_HANDLER",
          message: `no mock agent handler registered for task type ${task.type}`,
        },
      };
    }

    if (this.llmAdapter?.supports(task.type)) {
      return await this.llmAdapter.execute(
        withDefaultRepairs(task, this.maxRepairAttempts),
        streamOpts,
      );
    }

    const toolTask = await this.tryToolCallingTask(task);
    if (toolTask) {
      return toolTask;
    }

    if (!this.llm) {
      return {
        ok: false,
        taskId: task.taskId,
        error: {
          code: "NO_ADAPTER",
          message: "agents.mode=llm but no LlmPort was provided",
        },
      };
    }

    const mock = this.mockScript.get(task.type);
    if (mock) {
      return await mock(task);
    }

    return {
      ok: false,
      taskId: task.taskId,
      error: {
        code: "NO_ADAPTER",
        message: `no LLM adapter for task type ${task.type}`,
      },
    };
  }

  /**
   * Generic tool-calling path for registered task types with buildMessages.
   */
  private async tryToolCallingTask(task: AgentTask): Promise<AgentResult | null> {
    if (!this.llm || !this.activeCtx) {
      return null;
    }
    const def = this.index.agentTaskTypes.get(task.type)?.value;
    if (!def?.buildMessages) {
      return null;
    }

    const toolIds = task.constraints.tools ?? [];
    const tools = toolIds.map((id) => this.toLlmToolDefinition(id)).filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );

    const prepared = withDefaultRepairs(task, this.maxRepairAttempts);
    return runToolCallingTask({
      llm: this.llm,
      model: this.defaultModel,
      task: prepared,
      messages: def.buildMessages(prepared),
      tools,
      invokeTool: (toolId, args, ctx, allowlist) =>
        this.invokeTool(toolId, args, ctx, allowlist),
      ctx: this.activeCtx,
      log: this.log,
      defaultTemperature: this.defaultTemperature,
      maxToolRounds: prepared.constraints.maxToolRounds,
      validateOutput: (data) => this.validateOutput(prepared, data),
      getRepairHints: async (taskType, schemaError) => {
        if (!this.activeCtx) return [];
        return this.collectRepairHints(taskType, schemaError, this.activeCtx);
      },
    });
  }

  private toLlmToolDefinition(
    toolId: string,
  ): import("@rpengineext/contracts").LlmToolDefinition | null {
    const owned = this.index.agentTools.get(toolId);
    if (!owned) return null;
    const def = owned.value;
    return {
      name: def.id,
      description: def.description,
      parameters:
        def.parametersJsonSchema ??
        ({
          type: "object",
          additionalProperties: true,
        } as import("@rpengineext/contracts").JsonObject),
    };
  }

  private validateOutput(
    task: AgentTask,
    data: JsonObject,
  ): Result<JsonObject, Failure> {
    const registered = this.index.agentTaskTypes.get(task.type)?.value;
    const schema = registered?.outputSchema ?? builtinOutputSchema(task.type);
    if (!schema) {
      return ok(data);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      return err(
        failure("SCHEMA_INVALID", `agent output failed schema for ${task.type}`, {
          details: parsed.error.flatten(),
        }),
      );
    }
    return ok(parsed.data as JsonObject);
  }

  private emitStarted(task: AgentTask): void {
    this.events?.publish({
      type: "agent.task.started",
      sessionId: this.activeCtx?.sessionId,
      turnId: task.turnId,
      taskId: task.taskId,
      taskType: task.type,
      at: this.clock.nowIso(),
    });
  }

  private emitFinished(task: AgentTask, success: boolean): void {
    this.clearNarrativeStream(task.taskId);
    this.events?.publish({
      type: "agent.task.finished",
      sessionId: this.activeCtx?.sessionId,
      turnId: task.turnId,
      taskId: task.taskId,
      taskType: task.type,
      ok: success,
      at: this.clock.nowIso(),
    });
  }

  /**
   * Publishes a non-authoritative LLM stream delta for hosts/UI.
   *
   * @param task - agent task
   * @param text - delta fragment
   */
  emitStreamDelta(task: AgentTask, text: string): void {
    if (!text) return;

    let out = text;
    if (task.type === "narrative.write") {
      const prev = this.narrativeStreamBuffers.get(task.taskId) ?? "";
      const { nextRaw, proseDelta } = narrativeProseDelta(prev, text);
      this.narrativeStreamBuffers.set(task.taskId, nextRaw);
      if (!proseDelta) return;
      out = proseDelta;
    }

    this.events?.publish({
      type: "llm.stream.delta",
      sessionId: this.activeCtx?.sessionId,
      turnId: task.turnId,
      taskId: task.taskId,
      taskType: task.type,
      text: out,
      at: this.clock.nowIso(),
    });
  }

  private clearNarrativeStream(taskId: string): void {
    this.narrativeStreamBuffers.delete(taskId);
  }

  private async emitMockStream(
    task: AgentTask,
    data: JsonObject,
  ): Promise<void> {
    const prose =
      typeof data.prose === "string" ? data.prose : JSON.stringify(data);
    const chunkSize = 28;
    for (let i = 0; i < prose.length; i += chunkSize) {
      this.emitStreamDelta(task, prose.slice(i, i + chunkSize));
      // Yield so SSE clients can paint progressive draft text.
      await sleep(16);
    }
  }

  private toolFail(
    toolId: string,
    callId: string,
    args: JsonObject,
    started: number,
    fail: Failure,
  ): Result<JsonObject, Failure> {
    this.lastToolCalls.push({
      toolName: toolId,
      callId,
      args,
      error: fail.message,
      durationMs: this.clock.nowMs() - started,
    });
    return err(fail);
  }
}

function withDefaultRepairs(
  task: AgentTask,
  fallbackMax: number,
): AgentTask {
  const max = Math.max(task.constraints.maxRepairAttempts, fallbackMax);
  if (max === task.constraints.maxRepairAttempts) {
    return task;
  }
  return {
    ...task,
    constraints: {
      ...task.constraints,
      maxRepairAttempts: max,
    },
  };
}

function builtinOutputSchema(
  taskType: string,
): z.ZodType<JsonObject> | undefined {
  if (taskType === STANDARD_AGENT_TASK_TYPES.narrativeWrite) {
    return NarrativeWriteOutputSchema as unknown as z.ZodType<JsonObject>;
  }
  if (taskType === STANDARD_AGENT_TASK_TYPES.actionInterpret) {
    return ActionInterpretOutputSchema as unknown as z.ZodType<JsonObject>;
  }
  return undefined;
}

export type { AgentTaskTypeDefinition };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
