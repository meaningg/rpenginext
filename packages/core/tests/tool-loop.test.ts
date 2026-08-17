import { describe, expect, test } from "bun:test";

import {
  ok,
  type Failure,
  type JsonObject,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmPort,
  type Result,
  type TurnContext,
} from "@rpengineext/contracts";

import { runToolCallingTask } from "../src/agents/tool-loop.ts";
import { createCorePermissionChecker } from "../src/pipeline/turn-context.ts";

function fakeCtx(extras: Record<string, unknown> = {}): TurnContext {
  return {
    turnId: "trn_1",
    sessionId: "ses_1",
    stateView: {} as never,
    permissions: createCorePermissionChecker(),
    propose: () => ok(undefined),
    requestAgent: async (task) => ({
      ok: false,
      taskId: task.taskId,
      error: { code: "NO", message: "no" },
    }),
    log: {
      debug() {},
      info() {},
      warn() {},
      error() {},
      child() {
        return this;
      },
    },
    trace: { note() {} },
    get extras() {
      return extras as never;
    },
  };
}

describe("tool-calling loop", () => {
  test("success: model calls tool then returns final JSON", async () => {
    let step = 0;
    const llm: LlmPort = {
      async complete(
        _request: LlmCompletionRequest,
      ): Promise<Result<LlmCompletionResponse, Failure>> {
        step += 1;
        if (step === 1) {
          return ok({
            text: "",
            toolCalls: [
              { id: "c1", name: "echo", args: { q: "hi" } },
            ],
            finishReason: "tool_calls",
          });
        }
        return ok({ text: JSON.stringify({ done: true, q: "hi" }) });
      },
    };

    const invoked: string[] = [];
    const result = await runToolCallingTask({
      llm,
      model: "m",
      task: {
        taskId: "tsk_1",
        type: "test.echo",
        turnId: "trn_1",
        input: {},
        constraints: {
          timeoutMs: 5_000,
          maxRepairAttempts: 0,
          tools: ["echo"],
          optional: false,
        },
        requester: { kind: "module", id: "test" },
      },
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          name: "echo",
          description: "echo",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      ],
      invokeTool: async (id, args) => {
        invoked.push(id);
        return ok({ ...(args as JsonObject), ok: true });
      },
      ctx: fakeCtx(),
      validateOutput: (data) => {
        if (data.done === true) return ok(data);
        return {
          ok: false,
          error: { code: "SCHEMA_INVALID", message: "bad" },
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toBe(true);
    expect(invoked).toEqual(["echo"]);
  });

  test("error: unknown tool is reported back and loop can finish", async () => {
    let step = 0;
    const llm: LlmPort = {
      async complete(): Promise<Result<LlmCompletionResponse, Failure>> {
        step += 1;
        if (step === 1) {
          return ok({
            text: "",
            toolCalls: [{ id: "c1", name: "missing", args: {} }],
            finishReason: "tool_calls",
          });
        }
        return ok({ text: JSON.stringify({ done: true }) });
      },
    };

    const result = await runToolCallingTask({
      llm,
      model: "m",
      task: {
        taskId: "tsk_2",
        type: "test.echo",
        turnId: "trn_1",
        input: {},
        constraints: {
          timeoutMs: 5_000,
          maxRepairAttempts: 0,
          tools: ["echo"],
          optional: false,
        },
        requester: { kind: "module", id: "test" },
      },
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          name: "echo",
          description: "echo",
          parameters: { type: "object" },
        },
      ],
      invokeTool: async () => ({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "not allowlisted" },
      }),
      ctx: fakeCtx(),
      validateOutput: (data) => ok(data),
    });
    expect(result.ok).toBe(true);
  });

  test("edge: max tool rounds exceeded fails", async () => {
    const llm: LlmPort = {
      async complete(): Promise<Result<LlmCompletionResponse, Failure>> {
        return ok({
          text: "",
          toolCalls: [{ id: "c1", name: "echo", args: {} }],
          finishReason: "tool_calls",
        });
      },
    };

    const result = await runToolCallingTask({
      llm,
      model: "m",
      task: {
        taskId: "tsk_3",
        type: "test.echo",
        turnId: "trn_1",
        input: {},
        constraints: {
          timeoutMs: 5_000,
          maxRepairAttempts: 0,
          maxToolRounds: 2,
          tools: ["echo"],
          optional: false,
        },
        requester: { kind: "module", id: "test" },
      },
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          name: "echo",
          description: "echo",
          parameters: { type: "object" },
        },
      ],
      invokeTool: async () => ok({ ok: true }),
      ctx: fakeCtx(),
      maxToolRounds: 2,
      validateOutput: (data) => ok(data),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_INVALID");
  });
});
