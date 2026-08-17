import type {
  JsonObject,
  LlmCompletionRequest,
  LlmMessage,
  LlmToolCall,
  LlmToolChoice,
  LlmToolDefinition,
} from "@rpengineext/contracts";

/**
 * Wire body for POST /v1/responses (stateless).
 */
export interface ResponsesRequestBody {
  readonly model: string;
  readonly input: string | ResponsesInputItem[];
  readonly instructions?: string;
  readonly stream: boolean;
  readonly store: false;
  readonly temperature?: number;
  readonly max_output_tokens?: number;
  readonly text?: {
    readonly format: { readonly type: "json_object" | "text" };
  };
  readonly tools?: ResponsesFunctionTool[];
  readonly tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { readonly type: "function"; readonly name: string };
}

export type ResponsesInputItem =
  | {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }
  | {
      readonly type: "function_call";
      readonly call_id: string;
      readonly name: string;
      readonly arguments: string;
    }
  | {
      readonly type: "function_call_output";
      readonly call_id: string;
      readonly output: string;
    };

export interface ResponsesFunctionTool {
  readonly type: "function";
  readonly name: string;
  readonly description?: string;
  readonly parameters: JsonObject;
  readonly strict?: boolean;
}

export interface MapRequestOptions {
  /** When true, request JSON object format (may be unsupported by some gateways). */
  readonly preferJsonObjectFormat: boolean;
  /** When true, request provider SSE streaming. */
  readonly stream?: boolean;
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
  const hasTools = (request.tools?.length ?? 0) > 0;

  const body: ResponsesRequestBody = {
    model: request.model,
    input,
    stream: options.stream === true,
    store: false,
    ...(instructions !== undefined ? { instructions } : {}),
    ...(request.temperature !== undefined
      ? { temperature: request.temperature }
      : {}),
    ...(request.maxTokens !== undefined
      ? { max_output_tokens: request.maxTokens }
      : {}),
    ...(hasTools
      ? {
          tools: (request.tools ?? []).map(mapTool),
          tool_choice: mapToolChoice(request.toolChoice),
        }
      : {}),
  };

  // json_object format conflicts with tool calls on many gateways — skip when tools present.
  if (
    request.responseFormat === "json" &&
    options.preferJsonObjectFormat &&
    !hasTools
  ) {
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

function mapTool(tool: LlmToolDefinition): ResponsesFunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    ...(tool.strict !== undefined ? { strict: tool.strict } : { strict: true }),
  };
}

function mapToolChoice(
  choice: LlmToolChoice | undefined,
): ResponsesRequestBody["tool_choice"] {
  if (!choice || choice === "auto") return "auto";
  if (choice === "none") return "none";
  if (choice === "required") return "required";
  return { type: "function", name: choice.name };
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
        type: "function_call_output",
        call_id: message.toolCallId ?? "call_unknown",
        output: message.content,
      });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      if (message.content.trim().length > 0) {
        rest.push({
          role: "assistant",
          content: message.content,
        });
      }
      for (const call of message.toolCalls) {
        rest.push(mapToolCallItem(call));
      }
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
  if (rest.length === 1 && "role" in rest[0]! && rest[0]?.role === "user") {
    return { instructions, input: rest[0].content };
  }
  return { instructions, input: rest };
}

function mapToolCallItem(call: LlmToolCall): ResponsesInputItem {
  return {
    type: "function_call",
    call_id: call.id,
    name: call.name,
    arguments: JSON.stringify(call.args ?? {}),
  };
}
