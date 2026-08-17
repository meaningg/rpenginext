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

import { createWorldCanonModule, SLICE_NAME } from "../src/index.ts";

describe("world_canon module integration", () => {
  test("success: seeds from meta and injects into narrative system message", async () => {
    const requests: LlmCompletionRequest[] = [];
    const llm: LlmPort = {
      async complete(request): Promise<Result<LlmCompletionResponse, Failure>> {
        requests.push(request);
        return ok({
          text: JSON.stringify({ prose: "The cantina hums with low chatter." }),
        });
      },
    };

    const created = await createTestEngine({
      modules: [createWorldCanonModule()],
      llm,
      agentsMode: "llm",
      defaultModel: "test-model",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const canon =
      "Outer Rim ports run on bribes and rumor. Jedi are a dangerous legend.";
    const session = await created.value.engine.startSession({
      meta: { worldCanon: canon },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const state0 = created.value.runtime.getSessionState(session.value.sessionId);
    const slice0 = state0?.slices[SLICE_NAME] as {
      present: boolean;
      text: string;
    };
    expect(slice0.present).toBe(true);
    expect(slice0.text).toBe(canon);

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "I look around",
    });
    expect(turn.status).toBe("committed");

    const narrativeReq = requests.find((r) =>
      r.messages.some(
        (m) => m.role === "system" && m.content.includes("интерактивной книги"),
      ),
    );
    expect(narrativeReq).toBeTruthy();
    if (!narrativeReq) return;

    const system = narrativeReq.messages.find((m) => m.role === "system");
    expect(system?.content).toContain("WORLD CANON");
    expect(system?.content).toContain(canon);

    const user = narrativeReq.messages.find(
      (m) => m.role === "user" && m.content.includes("Действие игрока:"),
    );
    expect(user?.content).toContain("I look around");
    expect(user?.content).not.toContain(canon);
    expect(user?.content).not.toContain("TASK JSON");
    expect(user?.content).not.toContain("namespaces");
  });

  test("error path: missing story canon is no-op (no seed)", async () => {
    const created = await createTestEngine({
      modules: [createWorldCanonModule()],
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

  test("edge: blank worldCanon string does not seed", async () => {
    const created = await createTestEngine({
      modules: [createWorldCanonModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession({
      meta: { worldCanon: "   " },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as { present: boolean };
    expect(slice.present).toBe(false);
  });
});
