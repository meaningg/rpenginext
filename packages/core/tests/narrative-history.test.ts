import { describe, expect, test } from "bun:test";

import type { AgentTask } from "@rpengineext/contracts";

import {
  buildCoreNarrativePromptSections,
  buildNarrativeWriteMessages,
  sortNarrativePromptSections,
} from "../src/agents/prompts/narrative-write.ts";

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
    expect(messages[3]?.content).not.toContain("TASK JSON");
    expect(messages[3]?.content).not.toContain("narrative.write");
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
    expect(messages[1]?.content).not.toContain('"locale": "ru"');
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

  test("compiles narrativePromptSections into system/user without brief dump", () => {
    const task = {
      taskId: "task_frag",
      type: "narrative.write",
      turnId: "trn_frag",
      input: {
        brief: {
          playerAction: { kind: "free_text", text: "look" },
          namespaces: { character: { present: true, name: "Alex" } },
        },
        playerAction: { kind: "free_text", text: "look" },
        locale: "en",
        style: { voice: "second_person", length: "medium" },
        narrativePromptSections: [
          {
            id: "world_canon.text",
            channel: "system",
            title: "WORLD CANON",
            text: "Magic is rare.",
            priority: 10,
          },
          {
            id: "character.profile",
            channel: "system",
            title: "PLAYER CHARACTER",
            text: "Name: Alex",
            priority: 20,
          },
          {
            id: "core.constraints",
            channel: "user",
            title: "CONSTRAINTS",
            text: "Do not mention or reveal: the hidden prince",
            priority: 5,
          },
          {
            id: "core.style",
            channel: "system",
            title: "NARRATIVE STYLE",
            text: "- length: medium\n- voice: second_person",
            priority: 40,
          },
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
    const system = messages[0]?.content ?? "";
    expect(system).toContain("WORLD CANON");
    expect(system).toContain("Magic is rare.");
    expect(system).toContain("PLAYER CHARACTER");
    expect(system).toContain("Name: Alex");
    expect(system).toContain("NARRATIVE STYLE");
    expect(system).toContain("second_person");

    const user = messages[1]?.content ?? "";
    expect(user).toContain("CURRENT PLAYER ACTION");
    expect(user).toContain("look");
    expect(user).toContain("CONSTRAINTS");
    expect(user).toContain("hidden prince");
    expect(user).not.toContain("TASK JSON");
    expect(user).not.toContain("namespaces");
    expect(user).not.toContain('"present": true');
  });

  test("buildCoreNarrativePromptSections formats style and policy", () => {
    const sections = sortNarrativePromptSections(
      buildCoreNarrativePromptSections({
        style: { voice: "second_person", length: "short" },
        denyMention: ["secret map"],
        allowMention: ["the harbor"],
      }),
    );
    expect(sections.map((s) => s.id)).toEqual([
      "core.constraints",
      "core.style",
    ]);
    expect(sections[0]?.channel).toBe("user");
    expect(sections[0]?.text).toContain("secret map");
    expect(sections[1]?.channel).toBe("system");
    expect(sections[1]?.text).toContain("voice: second_person");
  });
});
