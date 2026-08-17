/**
 * Default pino redact paths for secrets and credentials.
 * Paths are merged with any caller-supplied paths (deduped).
 *
 * Never log API keys, tokens, or Authorization headers.
 */
export const DEFAULT_REDACT_PATHS: readonly string[] = [
  "apiKey",
  "api_key",
  "authorization",
  "Authorization",
  "password",
  "passwd",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "RP_LLM_API_KEY",
  "*.apiKey",
  "*.api_key",
  "*.authorization",
  "*.Authorization",
  "*.password",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.cookie",
] as const;

/**
 * Value written in place of redacted fields.
 */
export const REDACT_CENSOR = "[Redacted]" as const;

/**
 * Merges default and extra redact paths without duplicates.
 *
 * @param extra - Additional paths from factory options
 * @returns Deduped path list for pino `redact.paths`
 */
export function mergeRedactPaths(extra: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of [...DEFAULT_REDACT_PATHS, ...extra]) {
    if (path.length === 0 || seen.has(path)) {
      continue;
    }
    seen.add(path);
    result.push(path);
  }

  return result;
}
