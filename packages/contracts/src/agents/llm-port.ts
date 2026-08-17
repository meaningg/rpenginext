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
}
