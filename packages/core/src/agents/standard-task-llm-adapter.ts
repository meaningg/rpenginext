import {
  STANDARD_AGENT_TASK_TYPES,
  failure,
  ok,
  type AgentResult,
  type AgentTask,
  type Failure,
  type JsonObject,
  type LlmMessage,
  type LlmPort,
  type Result,
  type TurnLogger,
  NarrativeWriteOutputSchema,
  ActionInterpretOutputSchema,
  ActionInterpretInputSchema,
} from "@rpengineext/contracts";
import type { z } from "zod";

import {
  buildNarrativeWriteMessages,
  buildNarrativeWriteRepairMessages,
} from "./prompts/narrative-write.ts";

export interface StandardTaskLlmAdapterOptions {
  readonly llm: LlmPort;
  readonly model: string;
  readonly log?: TurnLogger;
  readonly defaultTemperature?: number;
}

/**
 * Maps standard AgentTask types to LlmPort calls with JSON parse + schema check.
 */
export class StandardTaskLlmAdapter {
  private readonly llm: LlmPort;
  private readonly model: string;
  private readonly log?: TurnLogger;
  private readonly defaultTemperature?: number;

  /**
   * @param options - adapter options
   */
  constructor(options: StandardTaskLlmAdapterOptions) {
    this.llm = options.llm;
    this.model = options.model;
    this.log = options.log?.child
      ? options.log.child({ component: "standard-task-llm" })
      : options.log;
    this.defaultTemperature = options.defaultTemperature;
  }

  /**
   * Whether this adapter can handle the task type.
   *
   * @param taskType - agent task type id
   */
  supports(taskType: string): boolean {
    return (
      taskType === STANDARD_AGENT_TASK_TYPES.narrativeWrite ||
      taskType === STANDARD_AGENT_TASK_TYPES.actionInterpret
    );
  }

  /**
   * Executes a standard task via LlmPort.
   *
   * @param task - agent task
   */
  async execute(task: AgentTask): Promise<AgentResult> {
    if (!this.supports(task.type)) {
      return {
        ok: false,
        taskId: task.taskId,
        error: {
          code: "NO_ADAPTER",
          message: `no LLM adapter mapping for task type ${task.type}`,
        },
      };
    }

    const maxRepairs = Math.max(0, task.constraints.maxRepairAttempts);
    let messages = this.buildInitialMessages(task);
    let lastRaw = "";
    let lastIssues = "";

    for (let attempt = 0; attempt <= maxRepairs; attempt++) {
      if (attempt > 0) {
        messages = this.buildRepairMessages(task, messages, lastRaw, lastIssues);
      }

      const completion = await this.llm.complete({
        model: this.model,
        messages,
        temperature:
          task.constraints.temperature ?? this.defaultTemperature ?? 0.7,
        timeoutMs: task.constraints.timeoutMs,
        responseFormat: "json",
        metadata: {
          taskId: task.taskId,
          taskType: task.type,
          turnId: task.turnId,
          attempt,
        },
      });

      if (!completion.ok) {
        return {
          ok: false,
          taskId: task.taskId,
          error: {
            code: mapLlmFailureCode(completion.error),
            message: completion.error.message,
            details: completion.error.details,
            retriable: completion.error.code === "TIMEOUT",
          },
        };
      }

      lastRaw = completion.value.text;
      const parsed = parseJsonObject(lastRaw);
      if (!parsed.ok) {
        lastIssues = parsed.error.message;
        this.log?.warn(
          { taskType: task.type, attempt, issue: lastIssues },
          "LLM JSON parse failed",
        );
        continue;
      }

      const schema = outputSchemaFor(task.type);
      const validated = schema.safeParse(parsed.value);
      if (!validated.success) {
        lastIssues = JSON.stringify(validated.error.flatten());
        this.log?.warn(
          { taskType: task.type, attempt },
          "LLM output failed schema",
        );
        continue;
      }

      return {
        ok: true,
        taskId: task.taskId,
        data: validated.data as JsonObject,
        usage: completion.value.usage,
        rawMeta: {
          model: this.model,
          attempt,
          repaired: attempt > 0,
        },
      };
    }

    return {
      ok: false,
      taskId: task.taskId,
      error: {
        code: "SCHEMA_INVALID",
        message: `LLM output failed schema for ${task.type} after repairs`,
        details: { lastIssues, lastRaw: truncate(lastRaw, 2000) },
      },
    };
  }

  private buildInitialMessages(task: AgentTask): LlmMessage[] {
    if (task.type === STANDARD_AGENT_TASK_TYPES.narrativeWrite) {
      return buildNarrativeWriteMessages(task);
    }
    // action.interpret
    const input = ActionInterpretInputSchema.safeParse(task.input);
    const payload = input.success ? input.data : task.input;
    return [
      {
        role: "system",
        content: [
          "You classify a player free-text action for a turn-based RPG book engine.",
          "Return ONLY JSON:",
          '{ "actionType": string, "confidence": number 0..1, "targets": string[], "extras": object }',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(payload, null, 2),
      },
    ];
  }

  private buildRepairMessages(
    task: AgentTask,
    base: readonly LlmMessage[],
    previousText: string,
    issues: string,
  ): LlmMessage[] {
    if (task.type === STANDARD_AGENT_TASK_TYPES.narrativeWrite) {
      return buildNarrativeWriteRepairMessages(base, previousText, issues);
    }
    return [
      ...base,
      { role: "assistant", content: previousText },
      {
        role: "user",
        content: `Previous JSON failed validation. Fix it. Issues: ${issues}`,
      },
    ];
  }
}

function outputSchemaFor(taskType: string): z.ZodType<unknown> {
  if (taskType === STANDARD_AGENT_TASK_TYPES.actionInterpret) {
    return ActionInterpretOutputSchema;
  }
  return NarrativeWriteOutputSchema;
}

function parseJsonObject(text: string): Result<JsonObject, Failure> {
  const trimmed = text.trim();
  const unfenced = stripMarkdownFence(trimmed);
  try {
    const value: unknown = JSON.parse(unfenced);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        error: failure("LLM_PARSE", "JSON root must be an object"),
      };
    }
    return ok(value as JsonObject);
  } catch (error) {
    // Try to extract first {...} block
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const value: unknown = JSON.parse(unfenced.slice(start, end + 1));
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return ok(value as JsonObject);
        }
      } catch {
        // fall through
      }
    }
    return {
      ok: false,
      error: failure("LLM_PARSE", "invalid JSON from model", {
        details: String(error),
      }),
    };
  }
}

function stripMarkdownFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return match?.[1]?.trim() ?? text;
}

function mapLlmFailureCode(error: Failure): string {
  if (error.code === "TIMEOUT") return "TIMEOUT";
  if (error.code === "LLM_HTTP") return "LLM_HTTP";
  if (error.code === "LLM_PARSE") return "LLM_PARSE";
  return error.code || "AGENT_FAILED";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
