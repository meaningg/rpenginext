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
        brief: {
          playerAction: {
            kind: "free_text",
            actionType: "free_text",
            text: "open the door",
          },
          intent: { intentType: "act" },
        },
        playerAction: {
          kind: "free_text",
          actionType: "free_text",
          text: "open the door",
        },
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
    expect(messages[0]?.content).toContain("game master");
    expect(messages[0]?.content).toContain("CURRENT action");
    expect(messages[0]?.content).toContain("free text");
    expect(messages[0]?.content).toContain('"prose": string');
    expect(messages[0]?.content).toContain('language of locale "en"');
    expect(messages[1]).toEqual({ role: "user", content: "hello" });
    expect(messages[2]).toEqual({ role: "assistant", content: "Hi there." });
    expect(messages[3]?.role).toBe("user");
    expect(messages[3]?.content).toContain("CURRENT PLAYER ACTION");
    expect(messages[3]?.content).toContain("open the door");
    expect(messages[3]?.content).toContain("narrative.write");
    // Prior history line must not be mistaken for the current action JSON text field alone.
    expect(messages[3]?.content).toContain('"text": "open the door"');
  });

  test("requires player-facing text in the given locale", () => {
    const task = {
      taskId: "task_ru",
      type: "narrative.write",
      turnId: "trn_ru",
      input: {
        brief: {
          playerAction: {
            kind: "free_text",
            text: "Иду к деревне",
          },
        },
        locale: "ru",
      },
      constraints: {
        timeoutMs: 1000,
        maxRepairAttempts: 0,
        optional: false,
      },
      requester: { kind: "core", id: "test" },
    } as AgentTask;

    const messages = buildNarrativeWriteMessages(task);
    expect(messages[0]?.content).toContain('language of locale "ru"');
    expect(messages[0]?.content).toContain("Do not switch to English");
    expect(messages[1]?.content).toContain("Иду к деревне");
    expect(messages[1]?.content).toContain('"locale": "ru"');
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
