import {
  STANDARD_AGENT_TASK_TYPES,
  err,
  failure,
  ok,
  type AgentResult,
  type AgentTask,
  type AgentTaskTypeDefinition,
  type EventBusPort,
  type Failure,
  type JsonObject,
  type LlmPort,
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
  private turnInFlight = 0;
  private lastToolCalls: ToolInvokeRecord[] = [];

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
    this.llmAdapter =
      options.llm && options.defaultModel
        ? new StandardTaskLlmAdapter({
            llm: options.llm,
            model: options.defaultModel,
            log: this.log,
            defaultTemperature: options.defaultTemperature,
          })
        : options.llm
          ? new StandardTaskLlmAdapter({
              llm: options.llm,
              model: "unspecified",
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
   * Resets per-turn agent bookkeeping.
   */
  beginTurn(): void {
    this.turnInFlight = 0;
    this.lastToolCalls = [];
  }

  /**
   * Executes many agent tasks with a concurrency limit.
   *
   * @param tasks - tasks to run
   */
  async executeMany(tasks: readonly AgentTask[]): Promise<AgentResult[]> {
    if (tasks.length === 0) return [];
    const results: AgentResult[] = new Array(tasks.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(this.maxParallelPerTurn, tasks.length) },
      async () => {
        while (true) {
          const index = next++;
          if (index >= tasks.length) return;
          results[index] = await this.execute(tasks[index]!);
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
   * @param ctx - turn context (permissions)
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
      const fail = failure(
        "PERMISSION_DENIED",
        `tool ${toolId} is not on the task allowlist`,
      );
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args,
        error: fail.message,
        durationMs: this.clock.nowMs() - started,
      });
      return err(fail);
    }

    const def = this.index.agentTools.get(toolId)?.value;
    if (!def) {
      const fail = failure("INTERNAL", `unknown agent tool: ${toolId}`);
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args,
        error: fail.message,
        durationMs: this.clock.nowMs() - started,
      });
      return err(fail);
    }

    if (def.permission && !ctx.permissions.allows(def.permission)) {
      const fail = failure(
        "PERMISSION_DENIED",
        `missing permission ${def.permission} for tool ${toolId}`,
      );
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args,
        error: fail.message,
        durationMs: this.clock.nowMs() - started,
      });
      return err(fail);
    }

    const parsedArgs = def.argsSchema.safeParse(args);
    if (!parsedArgs.success) {
      const fail = failure("SCHEMA_INVALID", `invalid args for tool ${toolId}`, {
        details: parsedArgs.error.flatten(),
      });
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args,
        error: fail.message,
        durationMs: this.clock.nowMs() - started,
      });
      return err(fail);
    }

    const handler = this.index.agentToolHandlers.find((item) => item.value.id === toolId);
    if (!handler) {
      const fail = failure("INTERNAL", `no handler registered for tool ${toolId}`);
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args,
        error: fail.message,
        durationMs: this.clock.nowMs() - started,
      });
      return err(fail);
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
        const fail = failure(
          "SCHEMA_INVALID",
          `tool ${toolId} returned invalid result`,
          { details: parsedResult.error.flatten() },
        );
        this.lastToolCalls.push({
          toolName: toolId,
          callId,
          args: parsedArgs.data,
          error: fail.message,
          durationMs: this.clock.nowMs() - started,
        });
        return err(fail);
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
      const fail = failure("MODULE_ERROR", `tool ${toolId} threw`, {
        details: String(error),
      });
      this.lastToolCalls.push({
        toolName: toolId,
        callId,
        args: parsedArgs.data,
        error: fail.message,
        durationMs: this.clock.nowMs() - started,
      });
      return err(fail);
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
   */
  async execute(task: AgentTask): Promise<AgentResult> {
    const started = this.clock.nowMs();
    this.turnInFlight += 1;
    this.log.debug(
      { taskId: task.taskId, type: task.type, mode: this.mode },
      "agent task start",
    );

    try {
      const raw = await this.invoke(task);
      if (!raw.ok) {
        this.emitFinished(task, false);
        return raw;
      }

      const validated = this.validateOutput(task, raw.data);
      if (!validated.ok) {
        // Mock path: optional single re-invoke. LLM adapter already repairs.
        if (this.mode === "mock" && this.maxRepairAttempts > 0) {
          const retry = await this.invoke(task);
          if (retry.ok) {
            const again = this.validateOutput(task, retry.data);
            if (again.ok) {
              this.emitFinished(task, true);
              return {
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
            }
          }
        }
        this.emitFinished(task, false);
        return {
          ok: false,
          taskId: task.taskId,
          error: {
            code: "SCHEMA_INVALID",
            message: validated.error.message,
            details: validated.error.details,
          },
        };
      }

      this.emitFinished(task, true);
      return {
        ok: true,
        taskId: task.taskId,
        data: validated.value,
        usage: raw.usage,
        rawMeta: {
          ...(raw.rawMeta ?? {}),
          durationMs: this.clock.nowMs() - started,
        },
      };
    } catch (error) {
      this.emitFinished(task, false);
      return {
        ok: false,
        taskId: task.taskId,
        error: {
          code: "AGENT_INTERNAL",
          message: "agent execution threw",
          details: String(error),
        },
      };
    } finally {
      this.turnInFlight = Math.max(0, this.turnInFlight - 1);
    }
  }

  private async invoke(task: AgentTask): Promise<AgentResult> {
    if (this.mode === "mock") {
      const mock = this.mockScript.get(task.type);
      if (mock) {
        return await mock(task);
      }
      // Allow LLM fallback in mock mode if no handler and llm present
      if (this.llmAdapter?.supports(task.type)) {
        return await this.llmAdapter.execute(
          withDefaultRepairs(task, this.maxRepairAttempts),
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

    // llm mode: standard tasks go through LlmPort (mocks ignored for those types)
    if (this.llmAdapter?.supports(task.type)) {
      return await this.llmAdapter.execute(
        withDefaultRepairs(task, this.maxRepairAttempts),
      );
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

    // Non-standard types in llm mode may still use mock handlers if registered
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

  private emitFinished(task: AgentTask, success: boolean): void {
    this.events?.publish({
      type: "agent.task.finished",
      taskId: task.taskId,
      taskType: task.type,
      ok: success,
      at: this.clock.nowIso(),
    });
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
