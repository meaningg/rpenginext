import type { LogLevel } from "./levels.ts";

/**
 * Structured key/value bindings attached to every log line
 * (root factory bindings or `logger.child(...)`).
 *
 * Reserved keys align with TurnContext / module packaging conventions.
 */
export interface LogBindings {
  readonly component?: string;
  readonly moduleId?: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly stage?: string;
  readonly [key: string]: unknown;
}

/**
 * Public logger surface used by core, modules, agents, and hosts.
 *
 * Implementation detail (pino) is intentionally not exposed.
 */
export interface Logger {
  /**
   * Minimum level that will be emitted.
   */
  readonly level: LogLevel;

  /**
   * Creates a child logger with additional permanent bindings.
   *
   * @param bindings - Fields merged into every subsequent log line
   */
  child(bindings: LogBindings): Logger;

  debug(message: string): void;
  debug(fields: object, message?: string): void;

  info(message: string): void;
  info(fields: object, message?: string): void;

  warn(message: string): void;
  warn(fields: object, message?: string): void;

  error(message: string): void;
  error(fields: object, message?: string): void;

  /**
   * Flushes buffered writes (best-effort). Safe to call on shutdown.
   */
  flush(): Promise<void>;
}

/**
 * Writable destination accepted by the factory (tests, custom sinks).
 * Compatible with Node/Bun writable streams and numeric fds.
 */
export type LoggerDestination =
  | NodeJS.WritableStream
  | NodeJS.WriteStream
  | number;

/**
 * Options for {@link createLogger}.
 */
export interface CreateLoggerOptions {
  /**
   * Minimum log level. Defaults to `RP_LOG_LEVEL` env or `"info"`.
   */
  level?: LogLevel;

  /**
   * When `true`, emit NDJSON (production / CI).
   * When `false` (default), use colored pino-pretty on stdout.
   * Forced to effective JSON mode when a custom `destination` is set
   * (pretty transport and custom destination are mutually exclusive).
   */
  json?: boolean;

  /**
   * Optional process/service name binding (`name` field).
   */
  name?: string;

  /**
   * Root bindings applied to every line from this logger tree.
   */
  bindings?: LogBindings;

  /**
   * Extra redact paths merged with {@link DEFAULT_REDACT_PATHS}.
   */
  redactPaths?: readonly string[];

  /**
   * Custom sink. Implies JSON lines (no pretty worker transport).
   */
  destination?: LoggerDestination;

  /**
   * Override for `RP_LOG_LEVEL` resolution (tests only).
   */
  envLogLevel?: string | undefined;
}
