#!/usr/bin/env bun
import { createHostRuntime } from "@rpengineext/host-bootstrap";

import { createApiServer } from "./server/create-server.ts";
import { HostDb } from "./persistence/host-db.ts";
import { createCharacterProfileReader } from "./services/character-reader.ts";
import { SessionService } from "./services/session-service.ts";
import { TurnService } from "./services/turn-service.ts";

/**
 * API host entrypoint.
 */
async function main(): Promise<void> {
  const forceMock = process.argv.includes("--mock");
  const boot = await createHostRuntime({
    forceMock,
    loggerName: "rpengineext-api",
  });
  if (!boot.ok) {
    console.error(`API boot failed: ${boot.error.message}`);
    process.exitCode = 1;
    return;
  }

  const runtime = boot.value;
  const hostDb = HostDb.open(
    runtime.env.dataDir,
    runtime.env.playerTokenSecret,
    runtime.env.hostSqlitePath,
  );

  const turns = new TurnService({
    engine: runtime.engine,
    events: runtime.events,
    log: runtime.log,
    maxConcurrentTurns: runtime.env.maxConcurrentTurns,
  });

  const sessions = new SessionService({
    engine: runtime.engine,
    hostDb,
    stories: runtime.storyCatalog,
    turns,
    readCharacter: createCharacterProfileReader(runtime),
    log: runtime.log,
    maxSessionsPerPlayer: runtime.env.maxSessionsPerPlayer,
  });

  const api = createApiServer({
    runtime,
    hostDb,
    sessions,
    turns,
    log: runtime.log,
  });

  // Prefer structured logger so host/engine lines share one stdout stream.
  runtime.log.info(
    {
      url: String(api.server.url),
      agentsMode: runtime.env.agentsMode,
      corsOrigin: runtime.env.corsOrigin,
      logLevel: runtime.env.logLevel,
    },
    "rpengineext API ready",
  );

  const shutdown = async () => {
    runtime.log.info("shutting down API…");
    await api.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
