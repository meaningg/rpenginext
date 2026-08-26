import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import {
  expectCommitted,
  expectSlice,
  fixedProseLlm,
  testModule,
} from "@rpengineext/module-sdk/test";

import { createWorldCanonModule, SLICE_NAME } from "../src/index.ts";

/**
 * Captures every LLM completion and delegates to fixedProseLlm so the
 * narrative.write schema receives valid JSON prose.
 */
function capturingLlm(
  store: LlmCompletionRequest[],
  prose: string,
): LlmPort {
  const inner = fixedProseLlm(prose);
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<Result<LlmCompletionResponse, Failure>> {
      store.push(request);
      return inner.complete(request);
    },
  };
}

describe("world_canon module integration", () => {
  test("success: seeds from meta and injects into narrative system message", async () => {
    const requests: LlmCompletionRequest[] = [];
    const canon =
      "Outer Rim ports run on bribes and rumor. Jedi are a dangerous legend.";
    const h = await testModule(createWorldCanonModule(), {
      llm: capturingLlm(requests, "The cantina hums with low chatter."),
      agentsMode: "llm",
      meta: { worldCanon: canon },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    expectSlice(h.value, SLICE_NAME, { present: true, text: canon });

    const turn = await h.value.turn("I look around");
    expectCommitted(turn);

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
    const h = await testModule(createWorldCanonModule());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expectSlice(h.value, SLICE_NAME, { present: false });
  });

  test("edge: blank worldCanon string does not seed", async () => {
    const h = await testModule(createWorldCanonModule(), {
      meta: { worldCanon: "   " },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expectSlice(h.value, SLICE_NAME, { present: false });
  });
});