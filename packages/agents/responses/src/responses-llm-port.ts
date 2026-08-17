import {
  err,
  failure,
  ok,
  type Failure,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmPort,
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

    const firstBody = useJsonFormat
      ? mapCompletionToResponsesBody(normalized, {
          preferJsonObjectFormat: true,
        })
      : mapCompletionToResponsesBodyWithoutJsonFormat(normalized);

    const first = await this.post(firstBody, request.timeoutMs);
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
      const retryBody = mapCompletionToResponsesBodyWithoutJsonFormat(normalized);
      return await this.post(retryBody, request.timeoutMs);
    }

    return first;
  }

  private async post(
    body: ResponsesRequestBody,
    timeoutMs?: number,
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
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        if (timer) clearTimeout(timer);
      }

      const rawText = await response.text();
      const durationMs = Date.now() - started;

      if (!response.ok) {
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
