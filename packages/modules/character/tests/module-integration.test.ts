import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import { ok } from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";

import {
  COMMAND_TYPES,
  createCharacterModule,
  SLICE_NAME,
  TOOL_IDS,
} from "../src/index.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("character module integration", () => {
  test("success: seeds from meta and injects into narrative system prompt", async () => {
    const requests: LlmCompletionRequest[] = [];
    const llm: LlmPort = {
      async complete(request): Promise<Result<LlmCompletionResponse, Failure>> {
        requests.push(request);
        return ok({
          text: JSON.stringify({ prose: "You step forward in your jacket." }),
        });
      },
    };

    const created = await createTestEngine({
      modules: [createCharacterModule()],
      llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession({
      meta: {
        character: {
          name: "Alex",
          appearance: "tall",
          features: "scar",
          outfit: "black jacket",
        },
      },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const state0 = created.value.runtime.getSessionState(session.value.sessionId);
    const slice0 = state0?.slices[SLICE_NAME] as {
      present: boolean;
      name: string;
      outfit: string;
    };
    expect(slice0.present).toBe(true);
    expect(slice0.name).toBe("Alex");
    expect(slice0.outfit).toBe("black jacket");

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "I look around",
    });
    expect(turn.status).toBe("committed");

    // Wait briefly for background outfit_sync (mock/default no change)
    await sleep(50);

    const narrativeReq = requests.find((r) =>
      r.messages.some(
        (m) => m.role === "system" && m.content.includes("game master"),
      ),
    );
    expect(narrativeReq).toBeTruthy();
    if (!narrativeReq) return;

    const system = narrativeReq.messages.find((m) => m.role === "system");
    expect(system?.content).toContain("PLAYER CHARACTER");
    expect(system?.content).toContain("Alex");
    expect(system?.content).toContain("black jacket");

    const user = narrativeReq.messages.find(
      (m) => m.role === "user" && m.content.includes("CURRENT PLAYER ACTION"),
    );
    expect(user?.content).toContain("I look around");
    expect(user?.content).not.toContain("PLAYER CHARACTER");
    expect(user?.content).not.toContain("TASK JSON");
    expect(user?.content).not.toContain("namespaces");
  });

  test("error path: missing story character is no-op (no seed)", async () => {
    const created = await createTestEngine({
      modules: [createCharacterModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as { present: boolean };
    expect(slice.present).toBe(false);
  });

  test("edge: background outfit tool updates outfit after player result", async () => {
    let narrativeCalls = 0;
    const llm: LlmPort = {
      async complete(request): Promise<Result<LlmCompletionResponse, Failure>> {
        const isOutfit = request.messages.some((m) =>
          m.content.includes("character.outfit_sync"),
        );
        if (!isOutfit) {
          narrativeCalls += 1;
          return ok({
            text: JSON.stringify({
              prose: "You put on a crimson cloak over your clothes.",
            }),
          });
        }

        // First outfit call → tool call; second → final JSON
        if ((request.tools?.length ?? 0) > 0 && !request.messages.some((m) => m.role === "tool")) {
          return ok({
            text: "",
            toolCalls: [
              {
                id: "call_1",
                name: TOOL_IDS.updateOutfit,
                args: { outfit: "crimson cloak over dark clothes" },
              },
            ],
            finishReason: "tool_calls",
          });
        }
        return ok({ text: JSON.stringify({ changed: true }) });
      },
    };

    const created = await createTestEngine({
      modules: [createCharacterModule()],
      llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession({
      meta: {
        character: {
          name: "Alex",
          appearance: "tall",
          features: "scar",
          outfit: "black jacket",
        },
      },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "I put on a crimson cloak",
    });
    expect(turn.status).toBe("committed");
    if (turn.status !== "committed") return;

    // Player turn itself must not include set_outfit (background only).
    expect(
      turn.acceptedCommands.some((c) => c.type === COMMAND_TYPES.setOutfit),
    ).toBe(false);
    expect(narrativeCalls).toBe(1);

    // Wait for background pump
    let outfit = "black jacket";
    for (let i = 0; i < 40; i++) {
      await sleep(25);
      const state = created.value.runtime.getSessionState(
        session.value.sessionId,
      );
      const slice = state?.slices[SLICE_NAME] as { outfit: string };
      outfit = slice.outfit;
      if (outfit.includes("crimson")) break;
    }
    expect(outfit).toBe("crimson cloak over dark clothes");
  });
});
