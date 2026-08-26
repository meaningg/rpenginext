import { describe, expect, test } from "bun:test";
import {
  ok,
  type AgentTask,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmPort,
  type Result,
  type Failure,
} from "@rpengineext/contracts";

import { getBuiltinDefaultProfile } from "../src/agents/prompts/builtin-default-profile.ts";
import {
  buildNarrativeWriteMessages,
  buildNarrativeWriteRepairMessages,
} from "../src/agents/prompts/narrative-write.ts";
import type { NarrativePromptProfile } from "../src/agents/prompts/profile-types.ts";
import { StandardTaskLlmAdapter } from "../src/agents/standard-task-llm-adapter.ts";

const CUSTOM_PROFILE: NarrativePromptProfile = {
  id: "narrative",
  version: "9.0.0",
  labels: { playerAction: "Игрок сделал:" },
  systemCore:
    "Ты — строгий редактор ({{locale}}). Длина: {{lengthGuidance}} Метка: «{{playerActionLabel}}»",
  rulesReminder: "Памятка редактора: никаких вопросов.",
  repair: {
    title: "Ответ невалиден.",
    instructions: [
      "Исправь JSON.",
      "Причина: {{issues}}",
      "Помощь: {{hints}}",
    ],
    hintsTitle: "Полезное:",
  },
  constraints: { temperature: 0.3, maxRepairAttempts: 2 },
};

function task(): AgentTask {
  return {
    taskId: "task_1",
    type: "narrative.write",
    turnId: "trn_1",
    input: {
      playerAction: { text: "открываю дверь" },
      locale: "ru",
      style: {},
    },
    constraints: { timeoutMs: 1000, maxRepairAttempts: 1, optional: false },
    requester: { kind: "core", id: "test" },
  };
}

describe("narrative profile integration", () => {
  test("default profile resolves placeholders without leftovers", () => {
    const messages = buildNarrativeWriteMessages(task());
    const system = messages[0]?.content ?? "";
    expect(system).toContain("Locale: ru.");
    expect(system).toContain("Мягкий ориентир длины prose");
    expect(system).toContain("«Действие игрока: …»");
    expect(system).not.toMatch(/\{\{/);
    expect(messages[1]?.content).toContain("Служебная памятка рассказчику");
  });

  test("custom profile replaces system core, rules reminder and label", () => {
    const messages = buildNarrativeWriteMessages(task(), CUSTOM_PROFILE);
    const system = messages[0]?.content ?? "";
    expect(system).toContain("Ты — строгий редактор (ru).");
    expect(system).toContain("Метка: «Игрок сделал:»");
    expect(system).not.toContain("интерактивной книги");
    expect(system).not.toMatch(/\{\{/);
    const user = messages[1]?.content ?? "";
    expect(user).toContain("Игрок сделал: открываю дверь");
    expect(user).toContain("Памятка редактора: никаких вопросов.");
  });

  test("custom repair messages resolve issues and hints", () => {
    const base = buildNarrativeWriteMessages(task(), CUSTOM_PROFILE);
    const repaired = buildNarrativeWriteRepairMessages(
      base,
      '{"prose":""}',
      "prose must be non-empty",
      ["hint one", "hint two"],
      CUSTOM_PROFILE,
    );
    const last = repaired[repaired.length - 1];
    expect(last?.role).toBe("user");
    expect(last?.content).toContain("Ответ невалиден.");
    expect(last?.content).toContain("Причина: prose must be non-empty");
    expect(last?.content).toContain("Помощь: hint one\nhint two");
    expect(last?.content).toContain("Полезное:\n- hint one\n- hint two");
  });

  test("default repair format is unchanged (golden)", () => {
    const base = buildNarrativeWriteMessages(task());
    const repaired = buildNarrativeWriteRepairMessages(
      base,
      '{"prose":""}',
      "prose must be non-empty",
      ["hint"],
    );
    const last = repaired[repaired.length - 1];
    expect(last?.content).toContain("Предыдущий JSON не прошёл проверку схемы.");
    expect(last?.content).toContain("Проблемы валидации: prose must be non-empty");
    expect(last?.content).toContain("Дополнительные подсказки:\n- hint");
  });

  test("built-in default profile satisfies constraints shape", () => {
    const profile = getBuiltinDefaultProfile();
    expect(profile.id).toBe("default");
    expect(profile.version).toBe("1.0.0");
  });

  test("adapter writes promptProfile ref into rawMeta (ADR 0007 D6)", async () => {
    class FakeLlm implements LlmPort {
      async complete(): Promise<Result<LlmCompletionResponse, Failure>> {
        return ok({ text: JSON.stringify({ prose: "ok" }), usage: undefined });
      }
    }
    const adapter = new StandardTaskLlmAdapter({
      llm: new FakeLlm(),
      model: "fake-model",
      promptProfile: CUSTOM_PROFILE,
      promptProfileRef: "narrative@9.0.0",
    });
    const result = await adapter.execute(task());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawMeta?.promptProfile).toBe("narrative@9.0.0");
    expect(result.rawMeta?.model).toBe("fake-model");
  });

  test("adapter applies profile constraints when task does not set them", async () => {
    let seen: LlmCompletionRequest | undefined;
    class FakeLlm implements LlmPort {
      async complete(
        request: LlmCompletionRequest,
      ): Promise<Result<LlmCompletionResponse, Failure>> {
        seen = request;
        return ok({ text: JSON.stringify({ prose: "ok" }), usage: undefined });
      }
    }
    const adapter = new StandardTaskLlmAdapter({
      llm: new FakeLlm(),
      model: "fake-model",
      promptProfile: CUSTOM_PROFILE, // temperature 0.3, maxRepairAttempts 2
    });
    const t = task();
    t.constraints = { timeoutMs: 1000, maxRepairAttempts: 1, optional: false };
    const result = await adapter.execute(t);
    expect(result.ok).toBe(true);
    expect(seen?.temperature).toBe(0.3);
  });
});
