import { afterAll, describe, expect, test } from "bun:test";

import {
  bootTestApi,
  createPlayer,
  type TestApi,
} from "./helpers/boot-test-api.ts";

describe("API integration", () => {
  let api: TestApi;

  afterAll(async () => {
    if (api) await api.stop();
  });

  test("player → template → session → action (mock)", async () => {
    api = await bootTestApi("api-int");
    const { baseUrl } = api;

    const health = await fetch(`${baseUrl}/health`);
    expect(health.ok).toBe(true);

    const player = await createPlayer(baseUrl, "Tester");

    const templatesRes = await fetch(`${baseUrl}/v1/templates`);
    const templatesBody = (await templatesRes.json()) as {
      templates: Array<{ id: string }>;
    };
    expect(templatesBody.templates.some((t) => t.id === "demo.hello")).toBe(
      true,
    );

    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: player.headers,
      body: JSON.stringify({
        templateId: "demo.hello",
        runOpening: true,
      }),
    });
    expect(sessionRes.status).toBe(201);
    const sessionBody = (await sessionRes.json()) as {
      session: { sessionId: string; passage: { prose: string } | null };
      openingTurn?: { status: string };
    };
    expect(sessionBody.session.sessionId).toBeTruthy();
    expect(sessionBody.openingTurn?.status ?? "committed").toBe("committed");

    const actionRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionBody.session.sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({ kind: "free_text", text: "look around" }),
      },
    );
    expect(actionRes.ok).toBe(true);
    const turn = (await actionRes.json()) as {
      status: string;
      passage?: { prose: string };
    };
    expect(turn.status).toBe("committed");
    expect(turn.passage?.prose?.length).toBeGreaterThan(0);
  });
});
