import {
  failure,
  ok,
  type AgentResult,
  type AgentTask,
  type Failure,
  type JsonObject,
  type LlmCompletionRequest,
  type LlmMessage,
  type LlmPort,
  type LlmToolCall,
  type LlmToolDefinition,
  type Result,
  type TurnContext,
  type TurnLogger,
} from "@rpengineext/contracts";

import { buildLlmAuditMeta } from "./llm-audit-meta.ts";

const DEFAULT_MAX_TOOL_ROUNDS = 4;

export interface ToolLoopInvokeTool {
  (
    toolId: string,
    args: JsonObject,
    ctx: TurnContext,
    allowlist?: readonly string[],
  ): Promise<Result<JsonObject, Failure>>;
}

export interface RunToolCallingTaskOptions {
  readonly llm: LlmPort;
  readonly model: string;
  readonly task: AgentTask;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly LlmToolDefinition[];
  readonly invokeTool: ToolLoopInvokeTool;
  readonly ctx: TurnContext;
  readonly log?: TurnLogger;
  readonly defaultTemperature?: number;
  readonly maxToolRounds?: number;
  /**
   * Validates final JSON object against the task output schema.
   */
  readonly validateOutput: (data: JsonObject) => Result<JsonObject, Failure>;
  readonly getRepairHints?: (
    taskType: string,
    schemaError: string,
  ) => Promise<readonly string[]>;
}

/**
 * Runs a multi-step LLM tool loop until the model returns final JSON (no tool calls).
 *
 * @param options - loop options
 */
export async function runToolCallingTask(
  options: RunToolCallingTaskOptions,
): Promise<AgentResult> {
  const task = options.task;
  const maxRounds = Math.max(
    1,
    options.maxToolRounds ??
      task.constraints.maxToolRounds ??
      DEFAULT_MAX_TOOL_ROUNDS,
  );
  const maxRepairs = Math.max(0, task.constraints.maxRepairAttempts);
  const allowlist = task.constraints.tools ?? options.tools.map((t) => t.name);

  let messages: LlmMessage[] = [...options.messages];
  let lastRaw = "";
  let lastIssues = "";
  let totalUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  let repairAttempt = 0;

  while (repairAttempt <= maxRepairs) {
    if (repairAttempt > 0) {
      const hints = options.getRepairHints
        ? await options.getRepairHints(task.type, lastIssues)
        : [];
      messages = [
        ...messages,
        { role: "assistant", content: lastRaw },
        {
          role: "user",
          content: buildRepairContent(lastIssues, hints),
        },
      ];
    }

    let round = 0;
    while (round < maxRounds) {
      round += 1;
      const request: LlmCompletionRequest = {
        model: options.model,
        messages,
        temperature:
          task.constraints.temperature ?? options.defaultTemperature ?? 0.2,
        timeoutMs: task.constraints.timeoutMs,
        responseFormat: "json",
        tools: options.tools.length > 0 ? options.tools : undefined,
        toolChoice: options.tools.length > 0 ? "auto" : "none",
        metadata: {
          taskId: task.taskId,
          taskType: task.type,
          turnId: task.turnId,
          toolRound: round,
          repairAttempt,
        },
      };

      const completion = await options.llm.complete(request);
      if (!completion.ok) {
        return {
          ok: false,
          taskId: task.taskId,
          error: {
            code: completion.error.code || "AGENT_FAILED",
            message: completion.error.message,
            details: completion.error.details,
            retriable: completion.error.code === "TIMEOUT",
          },
          rawMeta: buildLlmAuditMeta({
            messages,
            model: options.model,
            attempt: repairAttempt,
            repaired: repairAttempt > 0,
          }),
        };
      }

      accumulateUsage(totalUsage, completion.value.usage);
      const toolCalls = completion.value.toolCalls ?? [];
      if (toolCalls.length > 0) {
        messages = [
          ...messages,
          {
            role: "assistant",
            content: completion.value.text ?? "",
            toolCalls,
          },
        ];
        for (const call of toolCalls) {
          const toolResult = await executeOneTool(
            call,
            options.invokeTool,
            options.ctx,
            allowlist,
          );
          messages = [
            ...messages,
            {
              role: "tool",
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify(toolResult),
            },
          ];
        }
        continue;
      }

      lastRaw = completion.value.text ?? "";
      const parsed = parseJsonObject(lastRaw);
      if (!parsed.ok) {
        lastIssues = parsed.error.message;
        options.log?.warn(
          { taskType: task.type, repairAttempt, issue: lastIssues },
          "tool-loop JSON parse failed",
        );
        break;
      }

      const validated = options.validateOutput(parsed.value);
      if (!validated.ok) {
        lastIssues = validated.error.message;
        options.log?.warn(
          { taskType: task.type, repairAttempt },
          "tool-loop output failed schema",
        );
        break;
      }

      return {
        ok: true,
        taskId: task.taskId,
        data: validated.value,
        usage: totalUsage,
        rawMeta: buildLlmAuditMeta({
          messages,
          rawModelOutput: lastRaw,
          model: options.model,
          attempt: repairAttempt,
          repaired: repairAttempt > 0,
        }),
      };
    }

    if (round >= maxRounds && !lastIssues) {
      lastIssues = `max tool rounds exceeded (${maxRounds})`;
    }
    repairAttempt += 1;
  }

  return {
    ok: false,
    taskId: task.taskId,
    error: {
      code: "SCHEMA_INVALID",
      message: `tool-calling task ${task.type} failed after repairs`,
      details: { lastIssues, lastRaw: truncate(lastRaw, 2000) },
    },
    rawMeta: buildLlmAuditMeta({
      messages,
      rawModelOutput: lastRaw,
      model: options.model,
      attempt: maxRepairs,
      repaired: maxRepairs > 0,
    }),
  };
}

async function executeOneTool(
  call: LlmToolCall,
  invokeTool: ToolLoopInvokeTool,
  ctx: TurnContext,
  allowlist: readonly string[],
): Promise<JsonObject> {
  const args = call.args ?? {};
  const result = await invokeTool(call.name, args, ctx, allowlist);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error.message,
      code: result.error.code,
    };
  }
  return result.value;
}

function buildRepairContent(
  issues: string,
  hints: readonly string[],
): string {
  const lines = [
    "Your previous JSON failed validation or the tool loop stalled.",
    "Return ONLY valid final JSON for the task (no markdown fences).",
    `Issues: ${issues}`,
  ];
  if (hints.length > 0) {
    lines.push("Additional repair hints:");
    for (const hint of hints) {
      lines.push(`- ${hint}`);
    }
  }
  return lines.join("\n");
}

function parseJsonObject(text: string): Result<JsonObject, Failure> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: failure("LLM_PARSE", "empty model text"),
    };
  }
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

function accumulateUsage(
  total: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  },
  usage:
    | {
        readonly promptTokens?: number;
        readonly completionTokens?: number;
        readonly totalTokens?: number;
      }
    | undefined,
): void {
  if (!usage) return;
  total.promptTokens += usage.promptTokens ?? 0;
  total.completionTokens += usage.completionTokens ?? 0;
  total.totalTokens += usage.totalTokens ?? 0;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
