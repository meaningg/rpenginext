/**
 * Environment variable names for the Responses LLM adapter (host/CLI).
 * Secrets never belong in core or snapshots.
 */
export const LLM_ENV = {
  apiKey: "RP_LLM_API_KEY",
  baseUrl: "RP_LLM_BASE_URL",
  model: "RP_LLM_MODEL",
  timeoutMs: "RP_LLM_TIMEOUT_MS",
  agentsMode: "RP_AGENTS_MODE",
} as const;

/**
 * Host-side LLM settings resolved from env (no defaults for secrets/URLs).
 */
export interface HostLlmEnv {
  readonly apiKey: string | undefined;
  readonly baseUrl: string | undefined;
  readonly model: string | undefined;
  readonly timeoutMs: number | undefined;
  /** Explicit mode override: mock | llm */
  readonly agentsMode: "mock" | "llm" | undefined;
}

/**
 * Reads LLM-related environment variables.
 *
 * @param env - process env bag (defaults to process.env)
 */
export function readHostLlmEnv(
  env: Record<string, string | undefined> = process.env,
): HostLlmEnv {
  const modeRaw = env[LLM_ENV.agentsMode]?.trim().toLowerCase();
  const agentsMode =
    modeRaw === "mock" || modeRaw === "llm" ? modeRaw : undefined;

  const timeoutRaw = env[LLM_ENV.timeoutMs]?.trim();
  const timeoutMs =
    timeoutRaw && /^\d+$/.test(timeoutRaw) ? Number(timeoutRaw) : undefined;

  return {
    apiKey: emptyToUndefined(env[LLM_ENV.apiKey]),
    baseUrl: emptyToUndefined(env[LLM_ENV.baseUrl]),
    model: emptyToUndefined(env[LLM_ENV.model]),
    timeoutMs,
    agentsMode,
  };
}

/**
 * Resolves agents mode: explicit env wins; else llm if api key present; else mock.
 *
 * @param env - host llm env
 */
export function resolveAgentsMode(env: HostLlmEnv): "mock" | "llm" {
  if (env.agentsMode) {
    return env.agentsMode;
  }
  return env.apiKey && env.apiKey.length > 0 ? "llm" : "mock";
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
