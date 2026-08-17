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

    const renameRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionBody.session.sessionId}`,
      {
        method: "PATCH",
        headers: player.headers,
        body: JSON.stringify({ title: "Renamed session" }),
      },
    );
    expect(renameRes.ok).toBe(true);
    const renamedBody = (await renameRes.json()) as {
      session: { title: string; sessionId: string };
    };
    expect(renamedBody.session.title).toBe("Renamed session");

    const listBeforeDelete = await fetch(`${baseUrl}/v1/sessions`, {
      headers: player.headers,
    });
    const listBeforeBody = (await listBeforeDelete.json()) as {
      sessions: Array<{ sessionId: string }>;
    };
    expect(
      listBeforeBody.sessions.some(
        (s) => s.sessionId === sessionBody.session.sessionId,
      ),
    ).toBe(true);

    const deleteRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionBody.session.sessionId}`,
      {
        method: "DELETE",
        headers: player.headers,
      },
    );
    expect(deleteRes.ok).toBe(true);

    const listAfterDelete = await fetch(`${baseUrl}/v1/sessions`, {
      headers: player.headers,
    });
    const listAfterBody = (await listAfterDelete.json()) as {
      sessions: Array<{ sessionId: string }>;
    };
    expect(
      listAfterBody.sessions.some(
        (s) => s.sessionId === sessionBody.session.sessionId,
      ),
    ).toBe(false);
  });
});
