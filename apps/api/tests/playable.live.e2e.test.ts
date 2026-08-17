import { afterAll, describe, expect, test } from "bun:test";

import {
  bootTestApi,
  collectSessionSse,
  createPlayer,
  hasLiveLlmEnv,
  type TestApi,
} from "./helpers/boot-test-api.ts";

const MOCK_HELLO_SNIPPET =
  "Hello turn. The story begins as you take your first step";

const LIVE = hasLiveLlmEnv();

/**
 * Real LLM playability. Requires RP_LLM_API_KEY / BASE_URL / MODEL (via .env).
 */
describe.skipIf(!LIVE)("playable e2e (LIVE LLM)", () => {
  let api: TestApi;

  afterAll(async () => {
    if (api) await api.stop();
  });

  test(
    "live book loop: opening + async free-text turns over real narrative.write",
    async () => {
      api = await bootTestApi("playable-live", { agentsMode: "llm" });
      const { baseUrl } = api;
      expect(api.agentsMode).toBe("llm");

      const healthRes = await fetch(`${baseUrl}/health`);
      expect(healthRes.ok).toBe(true);
      const health = (await healthRes.json()) as { agentsMode: string };
      expect(health.agentsMode).toBe("llm");

      const player = await createPlayer(baseUrl, "Live Reader");

      const createRes = await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          templateId: "demo.hello",
          title: "Live E2E",
          runOpening: true,
        }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as {
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
          `opening turn rejected: ${created.openingTurn.failure?.message ?? "unknown"}`,
        );
      }
      expect(created.openingTurn?.status).toBe("committed");
      const openingProse = created.session.passage?.prose ?? "";
      expect(openingProse.length).toBeGreaterThan(20);
      // Must not be the fixed mock script string
      expect(openingProse.includes(MOCK_HELLO_SNIPPET)).toBe(false);

      const sessionId = created.session.sessionId;
      const sse = collectSessionSse(baseUrl, sessionId, player.headers);
      await sse.ready;

      const actionRes = await fetch(
        `${baseUrl}/v1/sessions/${sessionId}/actions`,
        {
          method: "POST",
          headers: player.headers,
          body: JSON.stringify({
            kind: "free_text",
            text: "I look around carefully and listen for any sound",
          }),
        },
      );
      expect(actionRes.status).toBe(202);
      const accepted = (await actionRes.json()) as {
        turnId: string;
        sessionId: string;
      };

      await sse.waitFor((name, data) => {
        if (name !== "turn.committed" && name !== "turn.rejected") return false;
        const payload = data as { event?: { turnId?: string } };
        return payload.event?.turnId === accepted.turnId;
      }, 180_000);

      const rejected = sse.events.find((e) => {
        if (e.name !== "turn.rejected") return false;
        const payload = e.data as { event?: { turnId?: string } };
        return payload.event?.turnId === accepted.turnId;
      });
      if (rejected) {
        const payload = rejected.data as {
          event?: { failure?: { message?: string } };
        };
        throw new Error(
          `live turn rejected: ${payload.event?.failure?.message ?? "unknown"}`,
        );
      }

      const stages = sse.events.filter((e) => e.name === "turn.stage");
      expect(stages.length).toBeGreaterThan(0);

      const agentStarted = sse.events.some(
        (e) => e.name === "agent.task.started",
      );
      expect(agentStarted).toBe(true);

      // Stream deltas are best-effort (provider may fall back to non-stream).
      // Require final passage either way.
      const passageRes = await fetch(
        `${baseUrl}/v1/sessions/${sessionId}/passage`,
        { headers: player.headers },
      );
      expect(passageRes.ok).toBe(true);
      const passageBody = (await passageRes.json()) as {
        passage: {
          prose: string;
        } | null;
      };
      const prose = passageBody.passage?.prose ?? "";
      expect(prose.length).toBeGreaterThan(20);
      expect(prose.includes(MOCK_HELLO_SNIPPET)).toBe(false);
      // Should advance from opening
      expect(prose).not.toBe(openingProse);

      const cont = await fetch(
        `${baseUrl}/v1/sessions/${sessionId}/actions?wait=1`,
        {
          method: "POST",
          headers: player.headers,
          body: JSON.stringify({
            kind: "free_text",
            text: "I continue forward through the scene",
          }),
        },
      );
      const contTurn = (await cont.json()) as {
        status: string;
        passage?: { prose: string };
        failure?: { message: string };
      };
      if (contTurn.status !== "committed") {
        throw new Error(
          `continue rejected: ${contTurn.failure?.message ?? contTurn.status}`,
        );
      }
      expect(contTurn.passage?.prose.length).toBeGreaterThan(20);

      sse.close();
    },
    300_000,
  );
});

if (!LIVE) {
  describe("playable e2e (LIVE LLM) skipped", () => {
    test("documents missing credentials", () => {
      console.warn(
        "SKIP live e2e: set RP_LLM_API_KEY, RP_LLM_BASE_URL, RP_LLM_MODEL",
      );
      expect(LIVE).toBe(false);
    });
  });
}
