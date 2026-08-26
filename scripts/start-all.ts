#!/usr/bin/env bun
/**
 * Dev orchestrator — запускает API host (движок) и Web UI одной командой.
 *
 * Usage: `bun start` из корня репозитория.
 *
 * Почему не `bun run --filter`:
 * - `--filter` выполняет скрипты с cwd = каталог пакета, а дефолтные пути
 *   `data/stories` / `data` резолвятся относительно cwd запуска из корня;
 * - дети наследуют cwd = корень репо, поэтому поведение идентично
 *   раздельному запуску `bun run api` + `bun run web` из корня.
 *
 * Ctrl+C / SIGTERM гасит оба процесса (API делает graceful shutdown).
 * Если один процесс падает сам — второй останавливается, код выхода ≠ 0.
 */
import path from "node:path";

import { createLogger } from "@rpengineext/logger";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

const log = createLogger({
  name: "rpengineext-devtools",
  level: "info",
  json: false,
  bindings: { component: "dev" },
});

/** Команды переиспользуют корневые скрипты `api` и `web` (см. package.json). */
const API_CMD = [process.execPath, "run", "apps/api/src/main.ts"];
const WEB_CMD = [process.execPath, "run", "--cwd", "apps/web", "dev"];

/** Лимит на graceful shutdown до принудительного SIGKILL. */
const SHUTDOWN_GRACE_MS = 3_000;

interface Child {
  readonly label: string;
  readonly proc: Bun.Subprocess;
}

const children = new Map<string, Bun.Subprocess>();

function spawnChild(label: string, cmd: string[]): void {
  log.info(`starting ${label}…`);
  const proc = Bun.spawn({
    cmd,
    cwd: REPO_ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  });
  children.set(label, proc);
}

let stopping = false;

async function stopAll(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info(`received ${signal} — stopping api + web…`);

  const alive = [...children.values()].filter((proc) => proc.exitCode === null);
  for (const proc of alive) {
    proc.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  }

  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (alive.some((proc) => proc.exitCode === null) && Date.now() < deadline) {
    await Bun.sleep(50);
  }
  for (const proc of alive) {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  }
  process.exit(0);
}

process.on("SIGINT", () => void stopAll("SIGINT"));
process.on("SIGTERM", () => void stopAll("SIGTERM"));

function watchChild(label: string, proc: Bun.Subprocess): void {
  void proc.exited.then((code) => {
    if (stopping) return;
    log.error({ label, code }, `"${label}" exited unexpectedly — stopping sibling`);
    for (const [otherLabel, other] of children) {
      if (otherLabel !== label && other.exitCode === null) other.kill("SIGTERM");
    }
    process.exit(code || 1);
  });
}

spawnChild("api", API_CMD);
spawnChild("web", WEB_CMD);
for (const [label, proc] of children) {
  watchChild(label, proc);
}