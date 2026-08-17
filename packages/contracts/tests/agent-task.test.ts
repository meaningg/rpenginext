import { describe, expect, test } from "bun:test";

import {
  parseActionInterpretOutput,
  parseNarrativeWriteOutput,
  STANDARD_AGENT_TASK_TYPES,
} from "../src/agents/standard-tasks.ts";
import {
  parseAgentResult,
  parseAgentTask,
} from "../src/agents/task.ts";

describe("agent tasks", () => {
  test("success: narrative.write task and output schemas", () => {
    const task = parseAgentTask({
      taskId: "task_1",
      type: STANDARD_AGENT_TASK_TYPES.narrativeWrite,
      turnId: "trn_1",
      input: { brief: { scene: "tavern" } },
      constraints: {
        timeoutMs: 30_000,
        maxRepairAttempts: 1,
        optional: false,
      },
      requester: { kind: "core", id: "pipeline" },
    });
    expect(task.success).toBe(true);

    const output = parseNarrativeWriteOutput({
      prose: "You push open the tavern door.",
      meta: { tone: "calm" },
    });
    expect(output.success).toBe(true);
  });

  test("error path: invalid constraints and empty prose", () => {
    const badTask = parseAgentTask({
      taskId: "task_2",
      type: STANDARD_AGENT_TASK_TYPES.actionInterpret,
      turnId: "trn_1",
      input: { text: "go north" },
      constraints: {
        timeoutMs: 0,
        maxRepairAttempts: 0,
      },
      requester: { kind: "module", id: "example" },
    });
    expect(badTask.success).toBe(false);

    const emptyProse = parseNarrativeWriteOutput({ prose: "" });
    expect(emptyProse.success).toBe(false);
  });

  test("edge: action.interpret output defaults and agent result union", () => {
    const interpreted = parseActionInterpretOutput({
      actionType: "move",
      confidence: 0.9,
    });
    expect(interpreted.success).toBe(true);
    if (interpreted.success) {
      expect(interpreted.data.targets).toEqual([]);
      expect(interpreted.data.extras).toEqual({});
    }

    const okResult = parseAgentResult({
      ok: true,
      taskId: "task_3",
      data: { actionType: "move", confidence: 0.9, targets: [], extras: {} },
    });
    expect(okResult.success).toBe(true);

    const failResult = parseAgentResult({
      ok: false,
      taskId: "task_3",
      error: { code: "TIMEOUT", message: "provider slow" },
    });
    expect(failResult.success).toBe(true);
  });
});
