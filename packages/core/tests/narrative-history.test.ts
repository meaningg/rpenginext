import { describe, expect, test } from "bun:test";

import type { AgentTask } from "@rpengineext/contracts";

import { buildNarrativeWriteMessages } from "../src/agents/prompts/narrative-write.ts";

describe("narrative.write history messages", () => {
  test("inserts history between system and brief user", () => {
    const task = {
      taskId: "task_1",
      type: "narrative.write",
      turnId: "trn_1",
      input: {
        brief: { intent: { intentType: "act" } },
        style: {},
        locale: "en",
        history: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "Hi there." },
        ],
      },
      constraints: {
        timeoutMs: 1000,
        maxRepairAttempts: 0,
        optional: false,
      },
      requester: { kind: "core", id: "test" },
    } as AgentTask;

    const messages = buildNarrativeWriteMessages(task);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]).toEqual({ role: "user", content: "hello" });
    expect(messages[2]).toEqual({ role: "assistant", content: "Hi there." });
    expect(messages[3]?.role).toBe("user");
    expect(messages[3]?.content).toContain("narrative.write");
    expect(messages[3]?.content).not.toContain('"hello"');
  });

  test("omits history when empty", () => {
    const task = {
      taskId: "task_2",
      type: "narrative.write",
      turnId: "trn_2",
      input: {
        brief: {},
      },
      constraints: {
        timeoutMs: 1000,
        maxRepairAttempts: 0,
        optional: false,
      },
      requester: { kind: "core", id: "test" },
    } as AgentTask;

    const messages = buildNarrativeWriteMessages(task);
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });
});
