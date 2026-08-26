import { describe, expect, test } from "bun:test";

import type {
  Failure,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
  Result,
} from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";
import {
  expectCommitted,
  expectSlice,
  fixedProseLlm,
  scriptedToolLlm,
  testModule,
  type ToolScriptStep,
} from "@rpengineext/module-sdk/test";

import {
  COMMAND_TYPES,
  createCharacterModule,
  SLICE_NAME,
  TOOL_IDS,
} from "../src/index.ts";

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

describe("character module integration", () => {
  test("success: seeds from meta and injects into narrative system prompt", async () => {
    const requests: LlmCompletionRequest[] = [];
    const h = await testModule(createCharacterModule(), {
      llm: capturingLlm(requests, "You step forward in your jacket."),
      agentsMode: "llm",
      meta: {
        character: {
          name: "Alex",
          appearance: "tall",
          features: "scar",
          outfit: "black jacket",
        },
      },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    expectSlice(h.value, SLICE_NAME, {
      present: true,
      name: "Alex",
      outfit: "black jacket",
    });

    const turn = await h.value.turn("I look around");
    expectCommitted(turn);

    // Drain the background outfit_sync pump (mock/default: no change).
    const idle = await h.value.waitIdle(5_000);
    expect(idle.ok).toBe(true);

    const narrativeReq = requests.find((r) =>
      r.messages.some(
        (m) => m.role === "system" && m.content.includes("интерактивной книги"),
      ),
    );
    expect(narrativeReq).toBeTruthy();
    if (!narrativeReq) return;

    const system = narrativeReq.messages.find((m) => m.role === "system");
    expect(system?.content).toContain("PLAYER CHARACTER");
    expect(system?.content).toContain("Alex");
    expect(system?.content).toContain("black jacket");

    const user = narrativeReq.messages.find(
      (m) => m.role === "user" && m.content.includes("Действие игрока:"),
    );
    expect(user?.content).toContain("I look around");
    expect(user?.content).not.toContain("PLAYER CHARACTER");
    expect(user?.content).not.toContain("TASK JSON");
    expect(user?.content).not.toContain("namespaces");
  });

  test("error path: missing story character is no-op (no seed)", async () => {
    const h = await testModule(createCharacterModule());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expectSlice(h.value, SLICE_NAME, { present: false });
  });

  test("edge: background outfit tool updates outfit after player result", async () => {
    // This scenario stays on createTestEngine (advanced/maintainer escape,
    // specs/02 §5.2): the harness surface does not expose the MemoryTraceSink,
    // and the assertions below verify the turn-trace dossier (## Follow-ups,
    // tool Arguments/Result, LLM transcript) which is only reachable via the
    // createTestEngine bundle. The LLM flow itself uses the scriptedToolLlm
    // mock: tool call → engine runs the real update_outfit handler → final
    // `{changed: true}` output.
    let narrativeCalls = 0;
    const script: ToolScriptStep[] = [
      {
        tool: TOOL_IDS.updateOutfit,
        args: { outfit: "crimson cloak over dark clothes" },
        result: { ok: true, outfit: "crimson cloak over dark clothes" },
      },
    ];
    const scripted = scriptedToolLlm(
      script,
      JSON.stringify({ changed: true }),
      "You put on a crimson cloak over your clothes.",
    );
    const llm: LlmPort = {
      async complete(
        request: LlmCompletionRequest,
      ): Promise<Result<LlmCompletionResponse, Failure>> {
        if (!request.tools || request.tools.length === 0) {
          narrativeCalls += 1;
        }
        return scripted.complete(request);
      },
    };

    const created = await createTestEngine({
      modules: [createCharacterModule()],
      llm,
      agentsMode: "llm",
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
    expectCommitted(turn);

    // Player turn itself must not include set_outfit (background only).
    expect(
      turn.acceptedCommands.some((c) => c.type === COMMAND_TYPES.setOutfit),
    ).toBe(false);
    expect(narrativeCalls).toBe(1);

    // Wait for the background pump (tool loop → final output).
    const idle = await created.value.runtime.waitIdle(
      session.value.sessionId,
      5_000,
    );
    expect(idle.ok).toBe(true);

    const state = created.value.runtime.getSessionState(
      session.value.sessionId,
    );
    const slice = state?.slices[SLICE_NAME] as { outfit: string };
    expect(slice.outfit).toBe("crimson cloak over dark clothes");

    // Background system turn must not replace the player-facing lastPassage.
    const passage = await session.value.getPassage();
    expect(passage.ok).toBe(true);
    if (!passage.ok) return;
    // Single player dossier: outfit_sync attaches under ## Follow-ups (no 2nd file).
    const files = [...created.value.memoryTraceSink.files.keys()];
    expect(files.length).toBe(1);
    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("## Follow-ups");
    expect(md).toContain("character.outfit_sync");
    expect(md).toContain("character.update_outfit");
    expect(md).toContain("#### Arguments");
    expect(md).toContain("crimson cloak over dark clothes");
    expect(md).toContain("#### Result");
    expect(md).toContain("#### LLM transcript");
    expect(md).toContain('role="system"');

    expect(passage.value?.prose).toBe(
      "You put on a crimson cloak over your clothes.",
    );
    expect(passage.value?.prose).not.toContain("(system)");
  });
});