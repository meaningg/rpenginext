import { describe, expect, test } from "bun:test";

import type { AgentTask } from "@rpengineext/contracts";

import { TOOL_IDS } from "../src/constants.ts";
import { buildProbeMessages } from "../src/probe-messages.ts";
import type { ProbeInput } from "../src/schema.ts";

function asTask(input: unknown): AgentTask {
  return { input } as unknown as AgentTask;
}

const INPUT: ProbeInput = {
  userText: "Продолжаю идти за проводником",
  prose: "Проводник сворачивает в переулок.",
  currentScene: {
    id: "scene-007",
    label: "Ночной квартал",
    type: "travel",
    beat: 3,
    startedAtTurnId: "turn-39",
    lastConfirmTurnId: "turn-41",
    lastProgress: 0.5,
  },
  history: [
    { role: "user", content: "Слежу за проводником" },
    { role: "assistant", content: "Он ускоряется." },
  ],
};

describe("buildProbeMessages", () => {
  test("system prompt names the tool and keeps input in the user message", () => {
    const messages = buildProbeMessages(asTask(INPUT));
    expect(messages.length).toBe(2);
    const [system, user] = messages;

    expect(system?.role).toBe("system");
    expect(system?.content).toContain(TOOL_IDS.reportScene);
    expect(system?.content).toContain('{"reported": true}');

    const parsed = JSON.parse(String(user?.content)) as ProbeInput;
    expect(parsed).not.toHaveProperty("sourceTurnId");
    expect(parsed.userText).toBe("Продолжаю идти за проводником");
    expect(parsed.currentScene).toMatchObject({ id: "scene-007", type: "travel" });
    expect(parsed.history).toEqual([
      { role: "user", content: "Слежу за проводником" },
      { role: "assistant", content: "Он ускоряется." },
    ]);
  });

  test("prompt is neutral: never pushes toward conflict or enemies", () => {
    const messages = buildProbeMessages(asTask(INPUT));
    const content = String(messages[0]?.content);

    // Anti-bias instruction is explicit…
    expect(content).toContain("Never invent conflict, enemies or chases");
    expect(content).toContain("Escalate ONLY from actual repetition");

    // …and no outcome-prescribing phrasing leaks in.
    const biased = ["surrender", "give up", "chase continues", "attack"];
    for (const word of biased) {
      expect(content.toLowerCase()).not.toContain(word);
    }
  });

  test("no turn ids reach the model — nothing to echo or mistype", () => {
    const messages = buildProbeMessages(asTask(INPUT));
    const content = String(messages[0]?.content);
    const user = String(messages[1]?.content);
    expect(content).not.toContain("sourceTurnId");
    expect(content).not.toContain("copy sourceTurnId");
    expect(user).not.toContain("sourceTurnId");
    expect(content).toContain("your full verdict, then output JSON");
  });

  test("scene identity is engine-owned: no sceneId field, strict transition rule", () => {
    const messages = buildProbeMessages(asTask(INPUT));
    const content = String(messages[0]?.content);
    expect(content).not.toContain("sceneId:");
    expect(content).not.toContain("scene-004");
    expect(content).toContain("assigned by the ENGINE");
    expect(content).toContain("genuinely new scene");
    expect(content).toContain("NOT a scene change");
  });

  test("lists all neutral scene types without emphasis", () => {
    const messages = buildProbeMessages(asTask(INPUT));
    const content = String(messages[0]?.content);
    for (const type of [
      "social",
      "exploration",
      "confrontation",
      "negotiation",
      "mystery",
      "travel",
      "preparation",
      "downtime",
      "ceremony",
      "discovery",
      "conflict",
      "other",
    ]) {
      expect(content).toContain(type);
    }
  });

  test("malformed input falls back to defaults without throwing", () => {
    const messages = buildProbeMessages(asTask({ bogus: 1 }));
    const parsed = JSON.parse(String(messages[1]?.content)) as ProbeInput;
    expect(parsed.history).toEqual([]);
    expect(parsed.currentScene).toBeNull();
  });
});