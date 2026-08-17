import type {
  AgentResult,
  AgentTask,
  JsonObject,
} from "@rpengineext/contracts";

/**
 * Handler for a mock agent task type.
 */
export type MockAgentHandler = (
  task: AgentTask,
) => Promise<AgentResult> | AgentResult;

/**
 * Scriptable mock agent responses keyed by task type.
 */
export class MockAgentScript {
  private readonly handlers = new Map<string, MockAgentHandler>();

  /**
   * Registers a handler for a task type (overwrites previous).
   *
   * @param taskType - agent task type id
   * @param handler - mock handler
   */
  on(taskType: string, handler: MockAgentHandler): this {
    this.handlers.set(taskType, handler);
    return this;
  }

  /**
   * Registers a fixed successful JSON payload for a task type.
   *
   * @param taskType - agent task type id
   * @param data - response data
   */
  fixed(taskType: string, data: JsonObject): this {
    return this.on(taskType, (task) => ({
      ok: true,
      taskId: task.taskId,
      data,
    }));
  }

  /**
   * Registers a fixed failure for a task type.
   *
   * @param taskType - agent task type id
   * @param code - error code
   * @param message - error message
   */
  fail(taskType: string, code: string, message: string): this {
    return this.on(taskType, (task) => ({
      ok: false,
      taskId: task.taskId,
      error: { code, message },
    }));
  }

  /**
   * Looks up a handler.
   *
   * @param taskType - task type
   */
  get(taskType: string): MockAgentHandler | undefined {
    return this.handlers.get(taskType);
  }

  /**
   * Whether a handler exists.
   *
   * @param taskType - task type
   */
  has(taskType: string): boolean {
    return this.handlers.has(taskType);
  }
}

/**
 * Default hello-turn narrative mock.
 */
export function createDefaultMockAgentScript(): MockAgentScript {
  return new MockAgentScript()
    .fixed("narrative.write", {
      prose:
        "Hello turn. The story begins as you take your first step into the interactive book.",
    })
    .on("action.interpret", (task) => {
      const text =
        typeof task.input.text === "string" ? task.input.text.trim() : "";
      return {
        ok: true,
        taskId: task.taskId,
        data: {
          actionType: text ? "free_text" : "noop",
          confidence: text ? 0.9 : 0.1,
          targets: [],
          extras: { interpretedFrom: text },
        },
      };
    })
    .on("character.outfit_sync", (task) => ({
      ok: true,
      taskId: task.taskId,
      data: { changed: false },
    }));
}

/**
 * Empty script for LLM mode (no mock handlers).
 */
export function createEmptyMockAgentScript(): MockAgentScript {
  return new MockAgentScript();
}
