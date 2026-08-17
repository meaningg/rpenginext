import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readHostLlmEnv,
  resolveAgentsMode,
} from "@rpengineext/agents-responses";
import { createHostRuntime, type HostRuntime } from "@rpengineext/host-bootstrap";

import { HostDb } from "../../src/persistence/host-db.ts";
import { createApiServer } from "../../src/server/create-server.ts";
import { SessionService } from "../../src/services/session-service.ts";
import { TurnService } from "../../src/services/turn-service.ts";

const STORIES_DIR = path.resolve(import.meta.dir, "../../../../data/stories");

export interface TestApi {
  readonly baseUrl: string;
  readonly runtime: HostRuntime;
  readonly tmpRoot: string;
  readonly agentsMode: "mock" | "llm";
  stop(): Promise<void>;
}

export interface BootTestApiOptions {
  /**
   * mock = forced script agents; llm = real Responses API from env.
   * @default "mock"
   */
  readonly agentsMode?: "mock" | "llm";
  readonly logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * Whether process env has enough credentials for live LLM.
 */
export function hasLiveLlmEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const llm = readHostLlmEnv(env);
  return Boolean(llm.apiKey && llm.baseUrl && llm.model);
}

/**
 * Boots an isolated API server on an ephemeral port.
 *
 * @param label - temp dir / logger label
 * @param options - mock vs live LLM
 */
export async function bootTestApi(
  label = "api-e2e",
  options: BootTestApiOptions = {},
): Promise<TestApi> {
  const agentsMode = options.agentsMode ?? "mock";
  if (agentsMode === "llm" && !hasLiveLlmEnv()) {
    throw new Error(
      "live LLM mode requires RP_LLM_API_KEY, RP_LLM_BASE_URL, RP_LLM_MODEL",
    );
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `rp-${label}-`));
  const dataDir = path.join(tmpRoot, "data");

  const boot = await createHostRuntime({
    forceMock: agentsMode === "mock",
    loggerName: label,
    env: {
      // inherit secrets / LLM settings from process (.env via Bun)
      ...process.env,
      RP_DATA_DIR: dataDir,
      RP_STORIES_DIR: STORIES_DIR,
      RP_LOG_LEVEL: options.logLevel ?? (agentsMode === "llm" ? "warn" : "error"),
      RP_AGENTS_MODE: agentsMode,
      RP_HTTP_HOST: "127.0.0.1",
      RP_HTTP_PORT: "0",
      RP_CORS_ORIGIN: "http://127.0.0.1:5173",
      RP_PLAYER_TOKEN_SECRET: `test-secret-${label}`,
    },
  });
  if (!boot.ok) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    throw new Error(`boot failed: ${boot.error.message}`);
  }

  const runtime = boot.value;
  if (runtime.env.agentsMode !== agentsMode) {
    await runtime.stop();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    throw new Error(
      `expected agentsMode=${agentsMode}, got ${runtime.env.agentsMode}`,
    );
  }

  const hostDb = HostDb.open(
    runtime.env.dataDir,
    runtime.env.playerTokenSecret,
  );
  const turns = new TurnService({
    engine: runtime.engine,
    events: runtime.events,
    log: runtime.log,
    maxConcurrentTurns: 8,
  });
  const sessions = new SessionService({
    engine: runtime.engine,
    hostDb,
    stories: runtime.storyCatalog,
    turns,
    log: runtime.log,
    maxSessionsPerPlayer: 16,
  });
  const api = createApiServer({
    runtime,
    hostDb,
    sessions,
    turns,
    log: runtime.log,
  });

  return {
    baseUrl: String(api.server.url).replace(/\/$/, ""),
    runtime,
    tmpRoot,
    agentsMode: runtime.env.agentsMode,
    stop: async () => {
      await api.stop();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
}

/**
 * Resolves preferred live/mock from env without forcing mock.
 */
export function resolveProcessAgentsMode(): "mock" | "llm" {
  return resolveAgentsMode(readHostLlmEnv(process.env));
}

export type AuthHeaders = {
  "Content-Type": string;
  Authorization: string;
  "X-Player-Id": string;
};

export async function createPlayer(
  baseUrl: string,
  displayName: string,
): Promise<{ playerId: string; token: string; headers: AuthHeaders }> {
  const res = await fetch(`${baseUrl}/v1/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) {
    throw new Error(`create player failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { playerId: string; token: string };
  return {
    playerId: body.playerId,
    token: body.token,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${body.token}`,
      "X-Player-Id": body.playerId,
    },
  };
}

export interface SseCollector {
  readonly events: Array<{ name: string; data: unknown }>;
  readonly ready: Promise<void>;
  close(): void;
  waitFor(
    predicate: (name: string, data: unknown) => boolean,
    timeoutMs?: number,
  ): Promise<{ name: string; data: unknown }>;
}

/**
 * Subscribes to session SSE and collects engine events.
 */
export function collectSessionSse(
  baseUrl: string,
  sessionId: string,
  headers: AuthHeaders,
): SseCollector {
  const events: Array<{ name: string; data: unknown }> = [];
  const controller = new AbortController();
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let readySettled = false;

  const markReady = () => {
    if (!readySettled) {
      readySettled = true;
      resolveReady?.();
    }
  };

  void (async () => {
    try {
      const response = await fetch(
        `${baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/events`,
        {
          headers: {
            Authorization: headers.Authorization,
            "X-Player-Id": headers["X-Player-Id"],
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        markReady();
        throw new Error(`SSE HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          let name = "message";
          let dataLine = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let data: unknown = dataLine;
          try {
            data = JSON.parse(dataLine);
          } catch {
            /* keep string */
          }
          events.push({ name, data });
          if (name === "ready") markReady();
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        // surface later via waitFor timeout
      }
    } finally {
      markReady();
    }
  })();

  return {
    events,
    ready,
    close: () => controller.abort(),
    waitFor: async (predicate, timeoutMs = 10_000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const hit = events.find((e) => predicate(e.name, e.data));
        if (hit) return hit;
        await Bun.sleep(20);
      }
      const names = events.map((e) => e.name).join(", ");
      throw new Error(
        `SSE wait timed out after ${timeoutMs}ms; saw: [${names}]`,
      );
    },
  };
}
