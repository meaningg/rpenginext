# `@rpengineext/agents-responses`

`LlmPort` adapter for OpenAI-compatible **Responses API** (`POST /v1/responses`).

## Env

| Variable | Required for live LLM | Description |
|----------|----------------------|-------------|
| `RP_LLM_API_KEY` | yes | Bearer token |
| `RP_LLM_BASE_URL` | yes | e.g. `http://127.0.0.1:8080/v1` |
| `RP_LLM_MODEL` | yes | public model name |
| `RP_LLM_TIMEOUT_MS` | no | request timeout |
| `RP_AGENTS_MODE` | no | `mock` \| `llm` (default: llm if key present) |

## Usage

```ts
import { ResponsesLlmPort } from "@rpengineext/agents-responses";

const llm = new ResponsesLlmPort({
  baseUrl: process.env.RP_LLM_BASE_URL!,
  apiKey: process.env.RP_LLM_API_KEY!,
  defaultModel: process.env.RP_LLM_MODEL,
});
```

## Notes

- Always sends `store: false`, `stream: false`.
- For `responseFormat: "json"`, tries `text.format.type=json_object` and falls back if the gateway rejects it.
- Never logs the API key.
