#!/usr/bin/env bun
import path from "node:path";

import { createFixtureHelloModule } from "@rpengineext/core/testing";
import { CORE_VERSION } from "@rpengineext/core";
import { createHostRuntime } from "@rpengineext/host-bootstrap";

/**
 * CLI host: thin argv layer over shared host-bootstrap.
 *
 * Usage:
 *   bun run apps/cli/src/main.ts --once hello
 *   bun run apps/cli/src/main.ts --once hello --fixture
 *   bun run apps/cli/src/main.ts --once hello --print-trace
 *   bun run apps/cli/src/main.ts --repl
 *   bun run apps/cli/src/main.ts --session <id> --repl
 *   bun run apps/cli/src/main.ts --mock --once hello
 *   bun run apps/cli/src/main.ts --modules
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
  const listModules = args.includes("--modules");
  const sessionIdx = args.indexOf("--session");
  const sessionIdArg =
    sessionIdx >= 0 ? (args[sessionIdx + 1] ?? undefined) : undefined;

  const boot = await createHostRuntime({
    forceMock,
    loggerName: "rpengineext-cli",
    extraModules: useFixture ? [createFixtureHelloModule()] : [],
  });

  if (!boot.ok) {
    console.error(`Engine boot failed: ${boot.error.message}`);
    process.exitCode = 1;
    return;
  }

  const { engine, runtime, env, persistence, created, stop } = boot.value;
  const traceSink = created.traceSink;

  if (listModules) {
    console.log(`rpengineext modules (core ${CORE_VERSION})`);
    const modules = boot.value.listModules();
    if (modules.length === 0) {
      console.log("(no modules loaded)");
    }
    for (const mod of modules) {
      console.log(
        `- ${mod.id} v${mod.version} priority=${mod.priority} slices=[${mod.slices.join(", ") || "-"}]`,
      );
    }
    await stop();
    return;
  }

  console.log(`rpengineext CLI (core ${CORE_VERSION})`);
  console.log(`agents mode: ${env.agentsMode}`);
  console.log(`working memory window: ${env.workingMemoryWindow} pairs`);
  console.log(`data dir: ${path.resolve(env.dataDir)}`);
  console.log(`sqlite: ${persistence.databaseFile}`);
  console.log(`traces dir: ${path.resolve(env.dataDir, "traces")}`);
  console.log(`stories: ${path.resolve(env.storiesDir)}`);

  const sessionResult = sessionIdArg
    ? await engine.loadSession(sessionIdArg)
    : await engine.startSession({ seed: "cli" });

  if (!sessionResult.ok) {
    console.error(
      `${sessionIdArg ? "loadSession" : "startSession"} failed: ${sessionResult.error.message}`,
    );
    await stop();
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
    const last =
      traceSink &&
      typeof traceSink === "object" &&
      "last" in traceSink &&
      typeof (traceSink as { last: () => unknown }).last === "function"
        ? (
            traceSink as {
              last: () => { path?: string; markdown?: string } | undefined;
            }
          ).last()
        : undefined;
    if (!last) {
      console.log("trace: (not written)");
      return;
    }
    console.log(`trace: ${last.path ?? "(memory)"}`);
    if (printTrace && last.markdown) {
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
    await stop();
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
        await stop();
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
        const topic =
          line.trim() === "/help" ? undefined : line.trim().slice(6);
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
            log: boot.value.log,
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

  const code = await runOnce("hello");
  await stop();
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
