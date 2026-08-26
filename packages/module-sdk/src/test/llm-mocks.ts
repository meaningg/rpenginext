import type {
  JsonObject,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmPort,
} from "@rpengineext/contracts";
import { err, ok, failure } from "@rpengineext/contracts";

/**
 * Scripted tool-calling step (specs/02 §4.4).
 * The mock consumes one step per completion call: it requests the named tool,
 * the engine runs the real tool handler, and the result is fed back to the
 * mock on the next completion (handled by the engine, not the mock).
 */
export interface ToolScriptStep {
  /** Tool id to request on this step. */
  readonly tool: string;
  /** Arguments sent with the tool call. */
  readonly args?: JsonObject;
  /** Not used for matching — kept for documentation of expected tool result. */
  readonly result: JsonObject;
}

/**
 * Creates an LLM mock that always returns the same prose (no tool calls).
 *
 * No-tool completions (e.g. narrative.write in llm-mode) receive JSON
 * `{"prose": …}` so the schema validation passes; tool-carrying calls get
 * the plain text (final output of a tool loop).
 *
 * @param prose - fixed assistant text
 */
export function fixedProseLlm(prose: string): LlmPort {
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<
      | { ok: true; value: LlmCompletionResponse }
      | { ok: false; error: { code: string; message: string } }
    > {
      return ok({
        text:
          (request.tools?.length ?? 0) === 0
            ? JSON.stringify({ prose })
            : prose,
        finishReason: "stop",
      });
    },
  };
}

/**
 * Creates a scripted tool-calling LLM mock (specs/02 §4.4).
 *
 * Flow: model requests tool → engine runs the tool handler → model called again
 * with the tool result → next script step (or final prose once steps are done).
 *
 * @param script - ordered tool requests; when exhausted the mock returns `prose`
 * @param prose - final assistant text after the script completes
 */
export function scriptedToolLlm(
  script: readonly ToolScriptStep[],
  prose = "{\"ok\":true}",
  narrativeText = "ok",
): LlmPort {
  const steps = [...script];
  let index = 0;

  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<{ ok: true; value: LlmCompletionResponse } | { ok: false; error: { code: string; message: string } }> {
      const step = steps[index];
      const available = new Set((request.tools ?? []).map((t) => t.name));

      // Non-tool completions (e.g. narrative.write on player turns) get
      // JSON prose that satisfies the narrative.write schema.
      if (!request.tools || request.tools.length === 0) {
        return ok({
          text: JSON.stringify({ prose: narrativeText }),
          finishReason: "stop",
        });
      }

      // A script step applies only to a call that actually exposes the tool
      // (e.g. the scheduled system task, not narrative.write).
      if (step && available.has(step.tool)) {
        index += 1;
        return ok({
          text: "",
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: `call_script_${index}`,
              name: step.tool,
              args: step.args ?? {},
            },
          ],
        });
      }

      // Tool-carrying call with no applicable step: final output. Default prose
      // is valid JSON for output-schema validation; pass prose explicitly for
      // prose-producing tasks.
      return ok({
        text: prose,
        finishReason: "stop",
      });
    },
  };
}

export type { LlmCompletionRequest, LlmCompletionResponse };