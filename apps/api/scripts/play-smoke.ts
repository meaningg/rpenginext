#!/usr/bin/env bun
/**
 * Live playability smoke (real LLM by default when credentials exist).
 *
 *   bun run apps/api/scripts/play-smoke.ts           # live if .env has RP_LLM_*
 *   bun run apps/api/scripts/play-smoke.ts --live    # require live LLM
 *   bun run apps/api/scripts/play-smoke.ts --mock    # force mock
 *   bun run apps/api/scripts/play-smoke.ts --url http://127.0.0.1:8787
 */
import {
  bootTestApi,
  collectSessionSse,
  createPlayer,
  hasLiveLlmEnv,
} from "../tests/helpers/boot-test-api.ts";

const MOCK_HELLO_SNIPPET =
  "Hello turn. The story begins as you take your first step";

async function main(): Promise<void> {
  const forceLive = process.argv.includes("--live");
  const forceMock = process.argv.includes("--mock");
  const urlIdx = process.argv.indexOf("--url");
  const externalUrl =
    urlIdx >= 0 ? process.argv[urlIdx + 1]?.replace(/\/$/, "") : undefined;

  if (forceLive && forceMock) {
    throw new Error("use only one of --live / --mock");
  }

  let agentsMode: "mock" | "llm" = "mock";
  if (forceMock) {
    agentsMode = "mock";
  } else if (forceLive) {
    if (!hasLiveLlmEnv()) {
      throw new Error(
        "--live requires RP_LLM_API_KEY, RP_LLM_BASE_URL, RP_LLM_MODEL",
      );
    }
    agentsMode = "llm";
  } else if (hasLiveLlmEnv()) {
    agentsMode = "llm";
  } else {
    console.warn("no RP_LLM_* credentials; falling back to mock");
    agentsMode = "mock";
  }

  let baseUrl = externalUrl ?? "";
  let stop: (() => Promise<void>) | undefined;
  let inProcessMode: "mock" | "llm" | undefined;

  if (!baseUrl) {
    const api = await bootTestApi(`play-smoke-${agentsMode}`, {
      agentsMode,
      logLevel: agentsMode === "llm" ? "warn" : "error",
    });
    baseUrl = api.baseUrl;
    stop = api.stop;
    inProcessMode = api.agentsMode;
    console.log(`booted in-process API at ${baseUrl} (agents=${api.agentsMode})`);
  } else {
    console.log(`using external API at ${baseUrl}`);
  }

  const turnTimeoutMs = agentsMode === "llm" || !inProcessMode ? 180_000 : 15_000;

  try {
    const health = await fetch(`${baseUrl}/health`);
    if (!health.ok) throw new Error(`health failed: ${health.status}`);
    const healthBody = (await health.json()) as {
      agentsMode: string;
      streaming: boolean;
    };
    console.log("health ok", healthBody);
    if (forceLive && healthBody.agentsMode !== "llm") {
      throw new Error(
        `expected live API agentsMode=llm, got ${healthBody.agentsMode}`,
      );
    }
    const effectiveMode =
      healthBody.agentsMode === "llm" ? "llm" : ("mock" as const);

    const player = await createPlayer(baseUrl, "Smoke Player");
    console.log("player", player.playerId);

    const createdRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: player.headers,
      body: JSON.stringify({ templateId: "demo.hello", runOpening: true }),
    });
    if (!createdRes.ok) {
      throw new Error(
        `create session: ${createdRes.status} ${await createdRes.text()}`,
      );
    }
    const created = (await createdRes.json()) as {
      session: {
        sessionId: string;
        passage: {
          prose: string;
        } | null;
      };
      openingTurn?: { status: string; failure?: { message: string } };
    };
    if (created.openingTurn?.status === "rejected") {
      throw new Error(
        `opening rejected: ${created.openingTurn.failure?.message ?? "?"}`,
      );
    }
    const sessionId = created.session.sessionId;
    const openingProse = created.session.passage?.prose ?? "";
    console.log("session", sessionId);
    console.log("opening prose:", openingProse.slice(0, 160));
    if (effectiveMode === "llm" && openingProse.includes(MOCK_HELLO_SNIPPET)) {
      throw new Error("opening looks like mock script under llm mode");
    }
    if (openingProse.length < 20) {
      throw new Error("opening prose too short");
    }

    const sse = collectSessionSse(baseUrl, sessionId, player.headers);
    await sse.ready;

    const act = await fetch(`${baseUrl}/v1/sessions/${sessionId}/actions`, {
      method: "POST",
      headers: player.headers,
      body: JSON.stringify({
        kind: "free_text",
        text: "I step forward into the story and examine my surroundings",
      }),
    });
    if (act.status !== 202) {
      throw new Error(
        `action expected 202, got ${act.status} ${await act.text()}`,
      );
    }
    const accepted = (await act.json()) as { turnId: string };
    console.log("async turn", accepted.turnId);

    const terminal = await sse.waitFor((name, data) => {
      if (name !== "turn.committed" && name !== "turn.rejected") return false;
      const payload = data as { event?: { turnId?: string } };
      return payload.event?.turnId === accepted.turnId;
    }, turnTimeoutMs);

    if (terminal.name === "turn.rejected") {
      const payload = terminal.data as {
        event?: { failure?: { message?: string } };
      };
      throw new Error(
        `turn rejected: ${payload.event?.failure?.message ?? "unknown"}`,
      );
    }

    const deltas = sse.events.filter((e) => e.name === "llm.stream.delta").length;
    const stages = sse.events.filter((e) => e.name === "turn.stage").length;
    console.log(`SSE ok: stages=${stages} streamDeltas=${deltas}`);

    const passageRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/passage`,
      { headers: player.headers },
    );
    const passageBody = (await passageRes.json()) as {
      passage: { prose: string } | null;
    };
    const prose = passageBody.passage?.prose ?? "";
    console.log("passage after turn:", prose.slice(0, 160));
    if (prose.length < 20) throw new Error("passage too short");
    if (effectiveMode === "llm" && prose.includes(MOCK_HELLO_SNIPPET)) {
      throw new Error("passage looks like mock script under llm mode");
    }
    if (prose === openingProse) {
      throw new Error("passage did not change after player action");
    }

    console.log("free-text continue");
    const cont = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          kind: "free_text",
          text: "I continue exploring",
        }),
      },
    );
    const contTurn = (await cont.json()) as {
      status: string;
      passage?: { prose?: string };
      failure?: { message: string };
    };
    if (contTurn.status !== "committed") {
      throw new Error(
        `continue not committed: ${contTurn.failure?.message ?? contTurn.status}`,
      );
    }
    console.log("continue turn committed");

    sse.close();
    console.log(`PLAYABLE SMOKE OK (mode=${effectiveMode})`);
  } finally {
    if (stop) await stop();
  }
}

main().catch((error) => {
  console.error("PLAYABLE SMOKE FAILED", error);
  process.exitCode = 1;
});
