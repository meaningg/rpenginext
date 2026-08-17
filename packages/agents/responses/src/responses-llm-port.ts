import {
  err,
  failure,
  ok,
  type Failure,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmPort,
  type LlmStreamHandlers,
  type Result,
  type TurnLogger,
} from "@rpengineext/contracts";

import {
  mapCompletionToResponsesBody,
  mapCompletionToResponsesBodyWithoutJsonFormat,
  type ResponsesRequestBody,
} from "./map-request.ts";
import { mapResponsesPayloadToCompletion } from "./map-response.ts";

/**
 * Options for {@link ResponsesLlmPort}.
 */
export interface ResponsesLlmPortOptions {
  /** Base URL including `/v1` suffix, e.g. `http://host/v1`. */
  readonly baseUrl: string;
  /** Bearer API key (never logged). */
  readonly apiKey: string;
  /** Optional default model when request.model is empty (should not happen). */
  readonly defaultModel?: string;
  /** Injected fetch for tests. */
  readonly fetch?: typeof fetch;
  /** Optional structured logger (no secrets). */
  readonly log?: TurnLogger;
  /**
   * Try `text.format=json_object` first for JSON requests.
   * On HTTP 4xx that looks format-related, retries without it.
   * @default true
   */
  readonly preferJsonObjectFormat?: boolean;
}

/**
 * LlmPort backed by OpenAI-compatible `POST /v1/responses`.
 */
export class ResponsesLlmPort implements LlmPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly log?: TurnLogger;
  private readonly preferJsonObjectFormat: boolean;
  private jsonFormatSupported: boolean | undefined;

  /**
   * @param options - adapter options
   */
  constructor(options: ResponsesLlmPortOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.fetchImpl = options.fetch ?? fetch;
    this.log = options.log?.child
      ? options.log.child({ component: "responses-llm-port" })
      : options.log;
    this.preferJsonObjectFormat = options.preferJsonObjectFormat ?? true;
  }

  /**
   * @inheritdoc
   */
  async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletionResponse, Failure>> {
    return this.completeInternal(request, undefined);
  }

  /**
   * @inheritdoc
   */
  async completeStream(
    request: LlmCompletionRequest,
    handlers: LlmStreamHandlers,
  ): Promise<Result<LlmCompletionResponse, Failure>> {
    const streamed = await this.completeInternal(request, handlers);
    if (streamed.ok) {
      return streamed;
    }
    // Fallback: non-stream complete + synthetic deltas for UI continuity.
    this.log?.warn(
      { code: streamed.error.code },
      "stream completion failed; falling back to non-stream",
    );
    const fallback = await this.completeInternal(request, undefined);
    if (fallback.ok) {
      emitChunked(fallback.value.text, handlers.onDelta);
    }
    return fallback;
  }

  private async completeInternal(
    request: LlmCompletionRequest,
    handlers: LlmStreamHandlers | undefined,
  ): Promise<Result<LlmCompletionResponse, Failure>> {
    const model = request.model || this.defaultModel;
    if (!model) {
      return err(failure("CONFIG_INVALID", "LLM model is required"));
    }

    const normalized: LlmCompletionRequest = { ...request, model };
    const wantsJson = request.responseFormat === "json";
    const useJsonFormat =
      wantsJson &&
      this.preferJsonObjectFormat &&
      this.jsonFormatSupported !== false;
    const stream = handlers !== undefined;

    const firstBody = useJsonFormat
      ? mapCompletionToResponsesBody(normalized, {
          preferJsonObjectFormat: true,
          stream,
        })
      : {
          ...mapCompletionToResponsesBodyWithoutJsonFormat(normalized),
          stream,
        };

    const first = await this.post(firstBody, request.timeoutMs, handlers);
    if (first.ok) {
      if (useJsonFormat) {
        this.jsonFormatSupported = true;
      }
      return first;
    }

    // Probe fallback: some gateways reject text.format.json_object
    if (
      useJsonFormat &&
      this.jsonFormatSupported !== true &&
      isLikelyFormatRejection(first.error)
    ) {
      this.log?.warn(
        { code: first.error.code },
        "responses json_object format rejected; retrying without text.format",
      );
      this.jsonFormatSupported = false;
      const retryBody = {
        ...mapCompletionToResponsesBodyWithoutJsonFormat(normalized),
        stream,
      };
      return await this.post(retryBody, request.timeoutMs, handlers);
    }

    return first;
  }

  private async post(
    body: ResponsesRequestBody,
    timeoutMs?: number,
    handlers?: LlmStreamHandlers,
  ): Promise<Result<LlmCompletionResponse, Failure>> {
    const url = `${this.baseUrl}/responses`;
    const started = Date.now();

    try {
      const controller = new AbortController();
      const timer =
        timeoutMs && timeoutMs > 0
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(body.stream ? { Accept: "text/event-stream" } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!response.ok) {
        const rawText = await response.text();
        const durationMs = Date.now() - started;
        this.log?.warn(
          {
            status: response.status,
            durationMs,
            model: body.model,
          },
          "responses HTTP error",
        );
        return err(
          failure("LLM_HTTP", `LLM HTTP ${response.status}`, {
            details: {
              status: response.status,
              body: truncate(rawText, 2000),
            },
          }),
        );
      }

      if (body.stream) {
        const streamed = await readResponsesSse(response, handlers?.onDelta);
        const durationMs = Date.now() - started;
        if (!streamed.ok) {
          return streamed;
        }
        this.log?.info(
          {
            model: body.model,
            durationMs,
            usage: streamed.value.usage,
            streamed: true,
          },
          "responses stream completion ok",
        );
        return streamed;
      }

      const rawText = await response.text();
      const durationMs = Date.now() - started;

      let payload: unknown;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        return err(
          failure("LLM_PARSE", "LLM response is not JSON", {
            details: { error: String(error), body: truncate(rawText, 500) },
          }),
        );
      }

      const mapped = mapResponsesPayloadToCompletion(payload);
      if (!mapped.ok) {
        return mapped;
      }

      this.log?.info(
        {
          model: body.model,
          durationMs,
          usage: mapped.value.usage,
        },
        "responses completion ok",
      );
      return ok(mapped.value);
    } catch (error) {
      if (isAbortError(error)) {
        return err(
          failure("TIMEOUT", "LLM request timed out", {
            details: { timeoutMs },
          }),
        );
      }
      return err(
        failure("LLM_HTTP", "LLM request failed", {
          details: String(error),
        }),
      );
    }
  }
}

async function readResponsesSse(
  response: Response,
  onDelta?: (text: string) => void,
): Promise<Result<LlmCompletionResponse, Failure>> {
  const body = response.body;
  if (!body) {
    return err(failure("LLM_PARSE", "LLM stream response has no body"));
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: LlmCompletionResponse["usage"];
  let completedPayload: unknown;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        if (!parsed || typeof parsed !== "object") continue;
        const obj = parsed as Record<string, unknown>;
        const type = typeof obj.type === "string" ? obj.type : "";
        const delta =
          typeof obj.delta === "string"
            ? obj.delta
            : typeof obj.text === "string"
              ? obj.text
              : undefined;
        if (
          delta &&
          (type.includes("delta") ||
            type.includes("output_text") ||
            type === "content.delta")
        ) {
          text += delta;
          onDelta?.(delta);
        }
        if (type === "response.completed" || type.endsWith(".completed")) {
          completedPayload = obj.response ?? obj;
        }
        if (obj.usage && typeof obj.usage === "object") {
          const u = obj.usage as Record<string, unknown>;
          usage = {
            promptTokens:
              typeof u.input_tokens === "number"
                ? u.input_tokens
                : typeof u.prompt_tokens === "number"
                  ? u.prompt_tokens
                  : undefined,
            completionTokens:
              typeof u.output_tokens === "number"
                ? u.output_tokens
                : typeof u.completion_tokens === "number"
                  ? u.completion_tokens
                  : undefined,
            totalTokens:
              typeof u.total_tokens === "number" ? u.total_tokens : undefined,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (completedPayload) {
    const mapped = mapResponsesPayloadToCompletion(completedPayload);
    if (mapped.ok) {
      if (!text && mapped.value.text) {
        emitChunked(mapped.value.text, onDelta);
      }
      return mapped;
    }
  }

  if (!text) {
    return err(failure("LLM_PARSE", "empty LLM stream"));
  }

  return ok({
    text,
    usage,
    raw: { streamed: true },
  });
}

function emitChunked(
  text: string,
  onDelta?: (chunk: string) => void,
  chunkSize = 48,
): void {
  if (!onDelta || !text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    onDelta(text.slice(i, i + chunkSize));
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
}

function isLikelyFormatRejection(error: Failure): boolean {
  if (error.code !== "LLM_HTTP") return false;
  const details = error.details as { status?: number; body?: string } | undefined;
  const status = details?.status;
  if (status !== 400 && status !== 422) return false;
  const body = (details?.body ?? "").toLowerCase();
  return (
    body.includes("format") ||
    body.includes("json_object") ||
    body.includes("text") ||
    body.includes("unsupported") ||
    body.includes("unknown") ||
    body.length > 0
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
