import pino from "pino";
import type { Logger as PinoLogger } from "pino";
import pretty from "pino-pretty";

import {
  isLogLevel,
  resolveLogLevel,
  type LogLevel,
} from "./levels.ts";
import { mergeRedactPaths, REDACT_CENSOR } from "./redact.ts";
import type {
  CreateLoggerOptions,
  LogBindings,
  Logger,
} from "./types.ts";

const PRETTY_IGNORE_FIELDS = "pid,hostname" as const;
const PRETTY_TRANSLATE_TIME = "SYS:standard" as const;
const PRETTY_ERROR_PROPS = "message,stack,code,type" as const;
/** stdout fd — used by pretty destination */
const STDOUT_FD = 1;

type LogMethod = "debug" | "info" | "warn" | "error";

/**
 * Creates a structured {@link Logger} backed by pino.
 *
 * - DI-friendly factory (no global singleton).
 * - Pretty colored output when `json` is false and no custom destination.
 *   Uses an in-process sync pretty stream (not worker transport) so host,
 *   API, and engine lines stay ordered and visible under Bun.
 * - NDJSON when `json` is true or a custom `destination` is provided.
 * - Default secret redaction; extend via `redactPaths`.
 *
 * @param options - Factory configuration
 * @returns Root logger; use `.child()` for turn/module scopes
 *
 * @example
 * ```ts
 * const log = createLogger({ name: "cli", level: "debug" });
 * const turnLog = log.child({ turnId: "t_1", component: "core" });
 * turnLog.info({ stage: "guard" }, "guards passed");
 * ```
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = resolveLogLevel(options.level, options.envLogLevel);
  const redactPaths = mergeRedactPaths(options.redactPaths ?? []);
  const usePretty = options.json !== true && options.destination === undefined;

  const baseOptions: pino.LoggerOptions = {
    level,
    name: options.name,
    base: sanitizeBindings(options.bindings),
    redact: {
      paths: redactPaths,
      censor: REDACT_CENSOR,
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  let pinoInstance: PinoLogger;

  if (usePretty) {
    // Worker `transport: { target: "pino-pretty" }` buffers out-of-process and
    // reorders/hides lines under Bun (API console vs engine child loggers).
    // Sync in-process stream keeps one shared stdout timeline for the host.
    const prettyStream = pretty({
      colorize: true,
      translateTime: PRETTY_TRANSLATE_TIME,
      ignore: PRETTY_IGNORE_FIELDS,
      errorProps: PRETTY_ERROR_PROPS,
      singleLine: false,
      sync: true,
      destination: STDOUT_FD,
    });
    pinoInstance = pino(baseOptions, prettyStream);
  } else if (options.destination !== undefined) {
    pinoInstance = pino(baseOptions, options.destination as pino.DestinationStream);
  } else {
    pinoInstance = pino(baseOptions);
  }

  return wrapPino(pinoInstance);
}

/**
 * Wraps a pino logger so callers never depend on pino types.
 *
 * @param instance - Underlying pino logger
 */
function wrapPino(instance: PinoLogger): Logger {
  const emit = (method: LogMethod, arg1: unknown, arg2?: string): void => {
    const fn = instance[method].bind(instance);
    if (typeof arg1 === "string") {
      fn(arg1);
      return;
    }
    if (arg1 instanceof Error) {
      fn({ err: arg1 }, arg2 ?? arg1.message);
      return;
    }
    if (arg1 !== null && typeof arg1 === "object") {
      if (arg2 === undefined) {
        fn(arg1);
      } else {
        fn(arg1, arg2);
      }
      return;
    }
    fn(String(arg1));
  };

  const logger: Logger = {
    get level(): LogLevel {
      const current = instance.level;
      return isLogLevel(current) ? current : "info";
    },

    child(bindings: LogBindings): Logger {
      const cleaned = sanitizeBindings(bindings);
      return wrapPino(instance.child(cleaned ?? {}));
    },

    debug(arg1: object | string, arg2?: string): void {
      emit("debug", arg1, arg2);
    },

    info(arg1: object | string, arg2?: string): void {
      emit("info", arg1, arg2);
    },

    warn(arg1: object | string, arg2?: string): void {
      emit("warn", arg1, arg2);
    },

    error(arg1: object | string, arg2?: string): void {
      emit("error", arg1, arg2);
    },

    flush(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          instance.flush((err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
  };

  return logger;
}

/**
 * Drops `undefined` binding values so pino does not serialize noise.
 *
 * @param bindings - Optional root or child bindings
 */
function sanitizeBindings(
  bindings: LogBindings | undefined,
): Record<string, unknown> | undefined {
  if (bindings === undefined) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bindings)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
