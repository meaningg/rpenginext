import {
  readHostLlmEnv,
  resolveAgentsMode,
  type HostLlmEnv,
} from "@rpengineext/agents-responses";
import { readWorkingMemoryWindowFromEnv } from "@rpengineext/module-working-memory";

/**
 * Host environment variable names (no secrets inlined).
 */
export const HOST_ENV = {
  dataDir: "RP_DATA_DIR",
  sqlitePath: "RP_SQLITE_PATH",
  hostSqlitePath: "RP_HOST_SQLITE_PATH",
  logLevel: "RP_LOG_LEVEL",
  logJson: "RP_LOG_JSON",
  storiesDir: "RP_STORIES_DIR",
  httpHost: "RP_HTTP_HOST",
  httpPort: "RP_HTTP_PORT",
  corsOrigin: "RP_CORS_ORIGIN",
  playerTokenSecret: "RP_PLAYER_TOKEN_SECRET",
  maxSessionsPerPlayer: "RP_MAX_SESSIONS_PER_PLAYER",
  maxConcurrentTurns: "RP_MAX_CONCURRENT_TURNS",
  agentsStreaming: "RP_AGENTS_STREAMING",
} as const;

const DEFAULT_DATA_DIR = "data";
const DEFAULT_STORIES_DIR = "data/stories";
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 8787;
const DEFAULT_CORS_ORIGIN = "http://127.0.0.1:5173";
const DEFAULT_MAX_SESSIONS_PER_PLAYER = 32;
const DEFAULT_MAX_CONCURRENT_TURNS = 8;

/**
 * Normalized host environment used by CLI and API bootstrap.
 */
export interface HostEnv {
  readonly dataDir: string;
  readonly sqlitePath: string | undefined;
  readonly hostSqlitePath: string | undefined;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly logJson: boolean;
  readonly storiesDir: string;
  readonly httpHost: string;
  readonly httpPort: number;
  readonly corsOrigin: string;
  readonly playerTokenSecret: string;
  readonly maxSessionsPerPlayer: number;
  readonly maxConcurrentTurns: number;
  readonly workingMemoryWindow: number;
  readonly agentsStreaming: boolean;
  readonly llm: HostLlmEnv;
  readonly agentsMode: "mock" | "llm";
}

/**
 * Reads and normalizes host environment variables.
 *
 * @param env - process env bag
 * @param options - optional forced agents mode (CLI --mock)
 */
export function readHostEnv(
  env: Record<string, string | undefined> = process.env,
  options: { readonly forceMock?: boolean } = {},
): HostEnv {
  const llm = readHostLlmEnv(env);
  const agentsMode = options.forceMock ? "mock" : resolveAgentsMode(llm);
  const logRaw = (env[HOST_ENV.logLevel] ?? "info").toLowerCase();
  const logLevel =
    logRaw === "debug" ||
    logRaw === "info" ||
    logRaw === "warn" ||
    logRaw === "error"
      ? logRaw
      : "info";

  return {
    dataDir: emptyToDefault(env[HOST_ENV.dataDir], DEFAULT_DATA_DIR),
    sqlitePath: emptyToUndefined(env[HOST_ENV.sqlitePath]),
    hostSqlitePath: emptyToUndefined(env[HOST_ENV.hostSqlitePath]),
    logLevel,
    logJson: env[HOST_ENV.logJson] === "1",
    storiesDir: emptyToDefault(env[HOST_ENV.storiesDir], DEFAULT_STORIES_DIR),
    httpHost: emptyToDefault(env[HOST_ENV.httpHost], DEFAULT_HTTP_HOST),
    httpPort: readHttpPort(env[HOST_ENV.httpPort], DEFAULT_HTTP_PORT),
    corsOrigin: emptyToDefault(env[HOST_ENV.corsOrigin], DEFAULT_CORS_ORIGIN),
    playerTokenSecret: emptyToDefault(
      env[HOST_ENV.playerTokenSecret],
      "dev-only-change-me",
    ),
    maxSessionsPerPlayer: readPositiveInt(
      env[HOST_ENV.maxSessionsPerPlayer],
      DEFAULT_MAX_SESSIONS_PER_PLAYER,
    ),
    maxConcurrentTurns: readPositiveInt(
      env[HOST_ENV.maxConcurrentTurns],
      DEFAULT_MAX_CONCURRENT_TURNS,
    ),
    workingMemoryWindow: readWorkingMemoryWindowFromEnv(env),
    agentsStreaming: env[HOST_ENV.agentsStreaming] !== "0",
    llm,
    agentsMode,
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function emptyToDefault(value: string | undefined, fallback: string): string {
  return emptyToUndefined(value) ?? fallback;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  return n > 0 ? n : fallback;
}

/**
 * HTTP port: positive int, or 0 for ephemeral bind (tests).
 */
function readHttpPort(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  if (n === 0) return 0;
  return n > 0 ? n : fallback;
}
