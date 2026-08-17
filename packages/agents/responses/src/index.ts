/**
 * `@rpengineext/agents-responses` — Responses API LlmPort adapter.
 *
 * @packageDocumentation
 */

export {
  ResponsesLlmPort,
  type ResponsesLlmPortOptions,
} from "./responses-llm-port.ts";
export {
  mapCompletionToResponsesBody,
  mapCompletionToResponsesBodyWithoutJsonFormat,
  type ResponsesRequestBody,
  type ResponsesInputItem,
} from "./map-request.ts";
export { mapResponsesPayloadToCompletion } from "./map-response.ts";
export {
  LLM_ENV,
  readHostLlmEnv,
  resolveAgentsMode,
  type HostLlmEnv,
} from "./config.ts";
