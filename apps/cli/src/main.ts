#!/usr/bin/env bun
import path from "node:path";

import { createLogger } from "@rpengineext/logger";
import {
  createEngine,
  createDefaultMockAgentScript,
  FilesystemTraceSink,
  CORE_VERSION,
} from "@rpengineext/core";
import { createFixtureHelloModule } from "@rpengineext/core/testing";
import { SqlitePersistence } from "@rpengineext/persistence-sqlite";
import {
  ResponsesLlmPort,
  readHostLlmEnv,
  resolveAgentsMode,
} from "@rpengineext/agents-responses";
import {
  createWorkingMemoryModule,
  readWorkingMemoryWindowFromEnv,
} from "@rpengineext/module-working-memory";

/**
 * CLI host for Phase 3: sqlite + optional live LLM + fs traces.
 *
 * Usage:
 *   bun run apps/cli/src/main.ts --once hello
 *   bun run apps/cli/src/main.ts --once hello --fixture
 *   bun run apps/cli/src/main.ts --once hello --print-trace
 *   bun run apps/cli/src/main.ts --repl
 *   bun run apps/cli/src/main.ts --session <id> --repl
 *   bun run apps/cli/src/main.ts --mock --once hello
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onceIdx = args.indexOf("--once");
  const onceText =
    onceIdx >= 0
      ? (args[onceIdx + 1] ?? "hello")
      : args.includes("--hello")
        ? "hello"
        : null;
  const useFixture = args.includes("--fixture");
  const repl = args.includes("--repl");
  const printTrace = args.includes("--print-trace");
  const forceMock = args.includes("--mock");
  const sessionIdx = args.indexOf("--session");
  const sessionIdArg =
    sessionIdx >= 0 ? (args[sessionIdx + 1] ?? undefined) : undefined;

  const dataDir = process.env.RP_DATA_DIR?.trim() || "data";
  const tracesDir = path.join(dataDir, "traces");
  const sqlitePath = process.env.RP_SQLITE_PATH?.trim() || undefined;

  const log = createLogger({
    name: "rpengineext-cli",
    level:
      (process.env.RP_LOG_LEVEL as "debug" | "info" | "warn" | "error") ||
      "info",
    json: process.env.RP_LOG_JSON === "1",
  });

  const llmEnv = readHostLlmEnv(process.env);
  const agentsMode = forceMock ? "mock" : resolveAgentsMode(llmEnv);
  const workingMemoryWindow = readWorkingMemoryWindowFromEnv(process.env);

  if (agentsMode === "llm") {
    if (!llmEnv.apiKey || !llmEnv.baseUrl || !llmEnv.model) {
      console.error(
        "LLM mode requires RP_LLM_API_KEY, RP_LLM_BASE_URL, and RP_LLM_MODEL (or pass --mock).",
      );
      process.exitCode = 1;
      return;
    }
  }

  const traceSink = new FilesystemTraceSink(dataDir);
  const persistence = await SqlitePersistence.open({
    dataDir,
    databaseFile: sqlitePath,
  });

  const llm =
    agentsMode === "llm" && llmEnv.apiKey && llmEnv.baseUrl
      ? new ResponsesLlmPort({
          baseUrl: llmEnv.baseUrl,
          apiKey: llmEnv.apiKey,
          defaultModel: llmEnv.model,
          log,
        })
      : undefined;

  const created = await createEngine({
    deps: {
      log,
      persistence,
      traceSink,
      llm,
    },
    modules: [
      createWorkingMemoryModule({ windowPairs: workingMemoryWindow }),
      ...(useFixture ? [createFixtureHelloModule()] : []),
    ],
    mockAgentScript:
      agentsMode === "mock" ? createDefaultMockAgentScript() : undefined,
    config: {
      moduleConfig: {
        working_memory: { windowPairs: workingMemoryWindow },
      },
      agents: {
        mode: agentsMode,
        defaultModel: llmEnv.model ?? "",
        defaultTimeoutMs: llmEnv.timeoutMs ?? 60_000,
        maxRepairAttempts: 2,
      },
      tracing: {
        enabled: true,
        directory: tracesDir,
      },
      persistence: {
        policy: "per_turn",
      },
    },
  });

  if (!created.ok) {
    log.error({ err: created.error }, "failed to create engine");
    console.error(`Engine boot failed: ${created.error.message}`);
    process.exitCode = 1;
    return;
  }

  const { engine, runtime } = created.value;
  console.log(`rpengineext CLI (core ${CORE_VERSION})`);
  console.log(`agents mode: ${agentsMode}`);
  console.log(`working memory window: ${workingMemoryWindow} pairs`);
  console.log(`data dir: ${path.resolve(dataDir)}`);
  console.log(`sqlite: ${persistence.databaseFile}`);
  console.log(`traces dir: ${path.resolve(tracesDir)}`);

  const sessionResult = sessionIdArg
    ? await engine.loadSession(sessionIdArg)
    : await engine.startSession({ seed: "cli" });

  if (!sessionResult.ok) {
    console.error(
      `${sessionIdArg ? "loadSession" : "startSession"} failed: ${sessionResult.error.message}`,
    );
    process.exitCode = 1;
    return;
  }
  const session = sessionResult.value;
  console.log(`session ${session.sessionId}`);

  if (sessionIdArg) {
    const passage = await session.getPassage();
    if (passage.ok && passage.value) {
      console.log("");
      console.log("— Last passage —");
      console.log(passage.value.prose);
    }
  }

  const reportTrace = (): void => {
    const last = traceSink.last();
    if (!last) {
      console.log("trace: (not written)");
      return;
    }
    console.log(`trace: ${last.path}`);
    if (printTrace) {
      console.log("");
      console.log("— Turn trace —");
      console.log(last.markdown);
    }
  };

  const runOnce = async (text: string): Promise<number> => {
    const result = await session.submitAction({
      kind: "free_text",
      text,
    });
    if (result.status === "committed") {
      console.log("");
      console.log("— Passage —");
      console.log(result.passage.prose);
      if (result.passage.choices.length > 0) {
        console.log("");
        console.log("Choices:");
        for (const choice of result.passage.choices) {
          console.log(`  [${choice.id}] ${choice.label}`);
        }
      }
      console.log("");
      console.log(
        `committed turn=${result.turnId} revision=${result.revision}`,
      );
      reportTrace();
      return 0;
    }
    console.error(
      `rejected: ${result.failure.code} — ${result.failure.message}`,
    );
    reportTrace();
    return 1;
  };

  if (onceText !== null) {
    const code = await runOnce(onceText);
    await engine.stop();
    persistence.close();
    process.exitCode = code;
    return;
  }

  if (repl) {
    console.log(
      "Type text to submit a turn. Commands: /save  /help  /replay  /quit  /session",
    );
    const prompt = async (): Promise<void> => {
      const line = await readLine("> ");
      if (line === null || line === "/quit" || line === "/exit") {
        await engine.stop();
        persistence.close();
        return;
      }
      if (line.trim().length === 0) {
        return prompt();
      }
      if (line.trim() === "/session") {
        console.log(session.sessionId);
        return prompt();
      }
      if (line.trim() === "/save") {
        const saved = await session.save();
        if (!saved.ok) {
          console.error(`save failed: ${saved.error.message}`);
        } else {
          console.log(
            `saved revision=${saved.value.revision} at ${saved.value.savedAt}`,
          );
        }
        return prompt();
      }
      if (line.trim() === "/help" || line.startsWith("/help ")) {
        const topic = line.trim() === "/help" ? undefined : line.trim().slice(6);
        const state = runtime.getSessionState(session.sessionId);
        if (!state) {
          console.error("no session state");
          return prompt();
        }
        const help = await runtime.getHostSurface().getHelp(
          {
            turnId: "cli_help",
            sessionId: session.sessionId,
            stateView: state,
            permissions: {
              allows: () => true,
              list: () => [],
            },
            propose: () => ({ ok: true as const, value: undefined }),
            requestAgent: async (task) => ({
              ok: false as const,
              taskId: task.taskId,
              error: { code: "CLI", message: "no agents in /help" },
            }),
            log,
            trace: { note: () => undefined },
            extras: {},
          },
          topic,
        );
        if (!help.ok) {
          console.error(`help failed: ${help.error.message}`);
        } else if (help.value.length === 0) {
          console.log(
            topic
              ? `no help topics matching "${topic}"`
              : "no module help topics registered",
          );
        } else {
          for (const item of help.value) {
            console.log(`[${item.moduleId}] ${item.id}`);
            console.log(item.body);
            console.log("");
          }
        }
        return prompt();
      }
      if (line.trim() === "/replay") {
        const replayed = await runtime.replaySessionJournal(session.sessionId);
        if (!replayed.ok) {
          console.error(`replay failed: ${replayed.error.message}`);
        } else {
          console.log(
            `replay applied=${replayed.value.appliedEntries} revision=${replayed.value.lastRevision} matchesLive=${replayed.value.matchesLive}`,
          );
        }
        return prompt();
      }
      await runOnce(line.trim());
      return prompt();
    };
    await prompt();
    return;
  }

  // default: hello once
  const code = await runOnce("hello");
  await engine.stop();
  persistence.close();
  process.exitCode = code;
}

function readLine(prefix: string): Promise<string | null> {
  return new Promise((resolve) => {
    process.stdout.write(prefix);
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      if (chunk.includes(0x0a)) {
        process.stdin.off("data", onData);
        const text = Buffer.concat(chunks)
          .toString("utf8")
          .replace(/\r?\n$/, "");
        resolve(text);
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", () => resolve(null));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
