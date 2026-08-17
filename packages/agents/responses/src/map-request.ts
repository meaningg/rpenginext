import type { LlmCompletionRequest, LlmMessage } from "@rpengineext/contracts";

/**
 * Wire body for POST /v1/responses (non-streaming, stateless).
 */
export interface ResponsesRequestBody {
  readonly model: string;
  readonly input: string | ResponsesInputItem[];
  readonly instructions?: string;
  readonly stream: false;
  readonly store: false;
  readonly temperature?: number;
  readonly max_output_tokens?: number;
  readonly text?: {
    readonly format: { readonly type: "json_object" | "text" };
  };
}

export interface ResponsesInputItem {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

export interface MapRequestOptions {
  /** When true, request JSON object format (may be unsupported by some gateways). */
  readonly preferJsonObjectFormat: boolean;
}

/**
 * Maps a provider-agnostic completion request to a Responses API body.
 *
 * @param request - LlmPort request
 * @param options - mapping options
 */
export function mapCompletionToResponsesBody(
  request: LlmCompletionRequest,
  options: MapRequestOptions = { preferJsonObjectFormat: true },
): ResponsesRequestBody {
  const { instructions, input } = splitMessages(request.messages);

  const body: ResponsesRequestBody = {
    model: request.model,
    input,
    stream: false,
    store: false,
    ...(instructions !== undefined ? { instructions } : {}),
    ...(request.temperature !== undefined
      ? { temperature: request.temperature }
      : {}),
    ...(request.maxTokens !== undefined
      ? { max_output_tokens: request.maxTokens }
      : {}),
  };

  if (request.responseFormat === "json" && options.preferJsonObjectFormat) {
    return {
      ...body,
      text: { format: { type: "json_object" } },
    };
  }

  return body;
}

/**
 * Same as {@link mapCompletionToResponsesBody} but without `text.format`
 * (fallback when gateway rejects json_object).
 *
 * @param request - LlmPort request
 */
export function mapCompletionToResponsesBodyWithoutJsonFormat(
  request: LlmCompletionRequest,
): ResponsesRequestBody {
  return mapCompletionToResponsesBody(request, {
    preferJsonObjectFormat: false,
  });
}

function splitMessages(messages: readonly LlmMessage[]): {
  instructions: string | undefined;
  input: string | ResponsesInputItem[];
} {
  const systemParts: string[] = [];
  const rest: ResponsesInputItem[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === "tool") {
      rest.push({
        role: "user",
        content: `[tool${message.toolCallId ? ` ${message.toolCallId}` : ""}] ${message.content}`,
      });
      continue;
    }
    rest.push({
      role: message.role,
      content: message.content,
    });
  }

  const instructions =
    systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

  if (rest.length === 0) {
    return { instructions, input: "" };
  }
  if (rest.length === 1 && rest[0]?.role === "user") {
    return { instructions, input: rest[0].content };
  }
  return { instructions, input: rest };
}
