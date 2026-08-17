import type { Result, Failure } from "../result.ts";
import type { JsonObject } from "../json.ts";
import type { TokenUsage } from "./task.ts";

/**
 * Low-level chat message for provider adapters.
 */
export interface LlmMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
}

/**
 * Provider-agnostic completion request.
 */
export interface LlmCompletionRequest {
  readonly model: string;
  readonly messages: readonly LlmMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly responseFormat?: "text" | "json";
  readonly metadata?: JsonObject;
}

/**
 * Provider-agnostic completion response.
 */
export interface LlmCompletionResponse {
  readonly text: string;
  readonly usage?: TokenUsage;
  readonly raw?: unknown;
}

/**
 * Handlers for optional token/text streaming on {@link LlmPort.completeStream}.
 */
export interface LlmStreamHandlers {
  /**
   * Called for each incremental text chunk (may be empty; ignore empties).
   *
   * @param text - delta text fragment
   */
  readonly onDelta: (text: string) => void;
}

/**
 * Port implemented by `packages/agents/*` adapters. Core depends only on this.
 */
export interface LlmPort {
  /**
   * Executes one completion call.
   *
   * @param request - provider-agnostic request
   */
  complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletionResponse, Failure>>;

  /**
   * Optional streaming completion. Implementations should still return the full
   * final text in the Result (same contract as {@link complete}).
   * Hosts/UI may treat deltas as draft-only until turn commit.
   *
   * @param request - provider-agnostic request
   * @param handlers - stream callbacks
   */
  completeStream?(
    request: LlmCompletionRequest,
    handlers: LlmStreamHandlers,
  ): Promise<Result<LlmCompletionResponse, Failure>>;
}
