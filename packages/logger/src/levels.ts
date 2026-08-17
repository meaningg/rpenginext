/**
 * Supported operational log levels (architecture: debug | info | warn | error).
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/**
 * Canonical log level union used across the monorepo.
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Environment variable that overrides the default log level when
 * `CreateLoggerOptions.level` is omitted.
 *
 * @see docs/architecture/08-configuration.md
 */
export const LOG_LEVEL_ENV_KEY = "RP_LOG_LEVEL" as const;

/**
 * Fallback level when neither options nor env provide a valid value.
 */
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

/**
 * Type guard for {@link LogLevel}.
 *
 * @param value - Unknown candidate (e.g. env string)
 * @returns `true` when `value` is a supported level
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === "string" &&
    (LOG_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Resolves effective level: explicit option → env → default.
 *
 * @param explicit - Level from factory options
 * @param envValue - Raw env string (injectable for tests)
 * @returns Valid {@link LogLevel}
 */
export function resolveLogLevel(
  explicit?: LogLevel,
  envValue: string | undefined = undefined,
): LogLevel {
  if (explicit !== undefined) {
    if (!isLogLevel(explicit)) {
      throw new TypeError(
        `Invalid log level "${String(explicit)}". Expected one of: ${LOG_LEVELS.join(", ")}`,
      );
    }
    return explicit;
  }

  const fromEnv = envValue ?? getEnvLogLevel();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    if (!isLogLevel(fromEnv)) {
      throw new TypeError(
        `Invalid ${LOG_LEVEL_ENV_KEY}="${fromEnv}". Expected one of: ${LOG_LEVELS.join(", ")}`,
      );
    }
    return fromEnv;
  }

  return DEFAULT_LOG_LEVEL;
}

function getEnvLogLevel(): string | undefined {
  try {
    return typeof process !== "undefined"
      ? process.env[LOG_LEVEL_ENV_KEY]
      : undefined;
  } catch {
    return undefined;
  }
}
