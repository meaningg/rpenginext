/**
 * `@rpengineext/logger` — shared structured logging for the monorepo.
 *
 * Hosts call {@link createLogger} once and inject the instance (or children)
 * into core, modules, agents, and persistence. No global singleton.
 *
 * @packageDocumentation
 */

export { createLogger } from "./create-logger.ts";

export {
  DEFAULT_LOG_LEVEL,
  isLogLevel,
  LOG_LEVEL_ENV_KEY,
  LOG_LEVELS,
  resolveLogLevel,
  type LogLevel,
} from "./levels.ts";

export {
  DEFAULT_REDACT_PATHS,
  mergeRedactPaths,
  REDACT_CENSOR,
} from "./redact.ts";

export type {
  CreateLoggerOptions,
  LogBindings,
  Logger,
  LoggerDestination,
} from "./types.ts";
