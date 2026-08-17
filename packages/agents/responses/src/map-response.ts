import {
  failure,
  ok,
  type Failure,
  type LlmCompletionResponse,
  type Result,
  type TokenUsage,
} from "@rpengineext/contracts";

/**
 * Extracts assistant text + usage from a Responses API JSON payload.
 *
 * @param payload - parsed JSON body
 */
export function mapResponsesPayloadToCompletion(
  payload: unknown,
): Result<LlmCompletionResponse, Failure> {
  if (!payload || typeof payload !== "object") {
    return errParse("responses payload is not an object");
  }

  const root = payload as Record<string, unknown>;

  if (root.error && typeof root.error === "object") {
    const errorObj = root.error as Record<string, unknown>;
    const message =
      typeof errorObj.message === "string"
        ? errorObj.message
        : "provider returned error object";
    return {
      ok: false,
      error: failure("LLM_HTTP", message, { details: root.error }),
    };
  }

  const status = typeof root.status === "string" ? root.status : undefined;
  if (status === "failed" || status === "cancelled") {
    return errParse(`responses status is ${status}`, root);
  }

  let text = "";
  if (typeof root.output_text === "string" && root.output_text.length > 0) {
    text = root.output_text;
  } else {
    text = extractOutputText(root.output);
  }

  if (!text) {
    return errParse("responses payload contained no output text", root);
  }

  const usage = mapUsage(root.usage);

  return ok({
    text,
    ...(usage ? { usage } : {}),
    raw: payload,
  });
}

function extractOutputText(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type === "message" && Array.isArray(row.content)) {
      for (const part of row.content) {
        if (!part || typeof part !== "object") continue;
        const content = part as Record<string, unknown>;
        if (
          (content.type === "output_text" || content.type === "text") &&
          typeof content.text === "string"
        ) {
          chunks.push(content.text);
        }
      }
    }
    if (typeof row.text === "string" && row.type === "output_text") {
      chunks.push(row.text);
    }
  }
  return chunks.join("");
}

function mapUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const u = usage as Record<string, unknown>;
  const promptTokens =
    typeof u.input_tokens === "number"
      ? u.input_tokens
      : typeof u.prompt_tokens === "number"
        ? u.prompt_tokens
        : undefined;
  const completionTokens =
    typeof u.output_tokens === "number"
      ? u.output_tokens
      : typeof u.completion_tokens === "number"
        ? u.completion_tokens
        : undefined;
  const totalTokens =
    typeof u.total_tokens === "number"
      ? u.total_tokens
      : promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined;

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }
  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function errParse(message: string, details?: unknown): Result<never, Failure> {
  return {
    ok: false,
    error: failure("LLM_PARSE", message, {
      details,
    }),
  };
}
