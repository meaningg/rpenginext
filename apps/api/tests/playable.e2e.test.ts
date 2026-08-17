import { afterAll, describe, expect, test } from "bun:test";

import {
  bootTestApi,
  collectSessionSse,
  createPlayer,
  type TestApi,
} from "./helpers/boot-test-api.ts";

/**
 * End-to-end playability: full book loop over HTTP as the web client does.
 */
describe("playable e2e (HTTP book loop)", () => {
  let api: TestApi;

  afterAll(async () => {
    if (api) await api.stop();
  });

  test("full playable loop: templates → open → SSE free-text turns → save → multiplayer isolation", async () => {
    api = await bootTestApi("playable");
    const { baseUrl } = api;

    // 1) Health
    const healthRes = await fetch(`${baseUrl}/health`);
    expect(healthRes.ok).toBe(true);
    const health = (await healthRes.json()) as {
      ok: boolean;
      agentsMode: string;
      streaming: boolean;
    };
    expect(health.ok).toBe(true);
    expect(health.agentsMode).toBe("mock");
    expect(health.streaming).toBe(true);

    // 2) Player + templates
    const player = await createPlayer(baseUrl, "Reader One");
    const templatesRes = await fetch(`${baseUrl}/v1/templates`);
    expect(templatesRes.ok).toBe(true);
    const templates = (await templatesRes.json()) as {
      templates: Array<{ id: string; title: string }>;
    };
    expect(templates.templates.length).toBeGreaterThanOrEqual(2);
    const hello = templates.templates.find((t) => t.id === "demo.hello");
    const book = templates.templates.find((t) => t.id === "demo.book");
    expect(hello?.title).toBeTruthy();
    expect(book?.title).toBeTruthy();

    // 3) Start demo.hello with opening turn
    const createRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: player.headers,
      body: JSON.stringify({
        templateId: "demo.hello",
        title: "E2E Hello",
        runOpening: true,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      session: {
        sessionId: string;
        title: string;
        templateId: string;
        passage: {
          prose: string;
          choices: Array<{ id: string; label: string }>;
        } | null;
      };
      openingTurn?: {
        status: string;
        passage?: { prose: string; choices: Array<{ id: string }> };
      };
    };
    const sessionId = created.session.sessionId;
    expect(sessionId).toMatch(/^ses_/);
    expect(created.session.templateId).toBe("demo.hello");
    expect(created.openingTurn?.status).toBe("committed");
    expect(created.session.passage?.prose.length).toBeGreaterThan(10);
    expect(created.session.passage?.choices ?? []).toEqual([]);

    // 4) GET session + passage
    const getRes = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
      headers: player.headers,
    });
    expect(getRes.ok).toBe(true);
    const got = (await getRes.json()) as {
      session: { passage: { prose: string } | null };
    };
    expect(got.session.passage?.prose).toBe(created.session.passage?.prose);

    // 5) SSE subscribe, then async free-text action
    const sse = collectSessionSse(baseUrl, sessionId, player.headers);
    await sse.ready;

    const actionRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/actions`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          kind: "free_text",
          text: "I open the first page carefully",
          clientActionId: "e2e_act_1",
        }),
      },
    );
    expect(actionRes.status).toBe(202);
    const accepted = (await actionRes.json()) as {
      mode: string;
      turnId: string;
      sessionId: string;
    };
    expect(accepted.mode).toBe("async");
    expect(accepted.turnId).toMatch(/^trn_/);
    expect(accepted.sessionId).toBe(sessionId);

    const committedEvt = await sse.waitFor((name, data) => {
      if (name !== "turn.committed") return false;
      const payload = data as { event?: { turnId?: string } };
      return payload.event?.turnId === accepted.turnId;
    });
    expect(committedEvt.name).toBe("turn.committed");

    // Progress + draft stream should have fired for mock narrative
    const stageEvents = sse.events.filter((e) => e.name === "turn.stage");
    expect(stageEvents.length).toBeGreaterThan(0);

    const streamDeltas = sse.events.filter(
      (e) => e.name === "llm.stream.delta",
    );
    expect(streamDeltas.length).toBeGreaterThan(0);
    const draftText = streamDeltas
      .map((e) => {
        const payload = e.data as { event?: { text?: string } };
        return payload.event?.text ?? "";
      })
      .join("");
    expect(draftText.length).toBeGreaterThan(0);

    const agentStarted = sse.events.some(
      (e) => e.name === "agent.task.started",
    );
    expect(agentStarted).toBe(true);

    // Poll job endpoint until pipeline fully settles (SSE commit can precede job map update)
    const jobBody = await pollTurnJob(
      baseUrl,
      sessionId,
      accepted.turnId,
      player.headers,
    );
    expect(jobBody.job.status).toBe("committed");
    expect(jobBody.job.result?.status).toBe("committed");
    expect(jobBody.job.result?.passage?.prose.length).toBeGreaterThan(0);

    // 6) Free-text only: no choices; choice actions rejected; another free-text turn
    const passageRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/passage`,
      { headers: player.headers },
    );
    const passageBody = (await passageRes.json()) as {
      passage: {
        prose: string;
        choices: Array<{ id: string; label: string; enabled?: boolean }>;
      } | null;
    };
    expect(passageBody.passage?.prose.length).toBeGreaterThan(0);
    expect(passageBody.passage?.choices ?? []).toEqual([]);

    const choiceReject = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({ kind: "choice", choiceId: "nope" }),
      },
    );
    expect(choiceReject.ok).toBe(true);
    const rejectedChoice = (await choiceReject.json()) as {
      status: string;
      failure?: { message: string };
    };
    expect(rejectedChoice.status).toBe("rejected");
    expect(rejectedChoice.failure?.message.toLowerCase()).toContain("free_text");

    const freeRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          kind: "free_text",
          text: "I walk deeper into the story",
        }),
      },
    );
    expect(freeRes.ok).toBe(true);
    const freeTurn = (await freeRes.json()) as {
      status: string;
      passage: { prose: string; choices: unknown[] };
      revision: number;
    };
    expect(freeTurn.status).toBe("committed");
    expect(freeTurn.revision).toBeGreaterThanOrEqual(2);
    expect(freeTurn.passage.prose.length).toBeGreaterThan(0);
    expect(freeTurn.passage.choices ?? []).toEqual([]);

    // 7) Save
    const saveRes = await fetch(`${baseUrl}/v1/sessions/${sessionId}/save`, {
      method: "POST",
      headers: player.headers,
    });
    expect(saveRes.ok).toBe(true);
    const saved = (await saveRes.json()) as {
      revision: number;
      savedAt: string;
    };
    expect(saved.revision).toBeGreaterThanOrEqual(freeTurn.revision);

    // 8) List sessions
    const listRes = await fetch(`${baseUrl}/v1/sessions`, {
      headers: player.headers,
    });
    const listBody = (await listRes.json()) as {
      sessions: Array<{ sessionId: string; title: string }>;
    };
    expect(
      listBody.sessions.some((s) => s.sessionId === sessionId),
    ).toBe(true);

    // 9) Second template session (demo.book, no opening required)
    const bookRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: player.headers,
      body: JSON.stringify({
        templateId: "demo.book",
        runOpening: false,
      }),
    });
    expect(bookRes.status).toBe(201);
    const bookSession = (await bookRes.json()) as {
      session: { sessionId: string; passage: unknown };
    };
    const bookAction = await fetch(
      `${baseUrl}/v1/sessions/${bookSession.session.sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          kind: "free_text",
          text: "Walk into the fog",
        }),
      },
    );
    expect(bookAction.ok).toBe(true);
    const bookTurn = (await bookAction.json()) as { status: string };
    expect(bookTurn.status).toBe("committed");

    // 10) Multi-player isolation
    const player2 = await createPlayer(baseUrl, "Reader Two");
    const steal = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
      headers: player2.headers,
    });
    expect(steal.status).toBe(401);

    const p2Create = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: player2.headers,
      body: JSON.stringify({ templateId: "demo.hello", runOpening: true }),
    });
    expect(p2Create.status).toBe(201);
    const p2Body = (await p2Create.json()) as {
      session: { sessionId: string };
    };
    expect(p2Body.session.sessionId).not.toBe(sessionId);

    const p2List = await fetch(`${baseUrl}/v1/sessions`, {
      headers: player2.headers,
    });
    const p2ListBody = (await p2List.json()) as {
      sessions: Array<{ sessionId: string }>;
    };
    expect(p2ListBody.sessions.every((s) => s.sessionId !== sessionId)).toBe(
      true,
    );

    // 11) Unauth blocked
    const noAuth = await fetch(`${baseUrl}/v1/sessions`);
    expect(noAuth.status).toBe(401);

    // 12) Idempotent clientActionId on sync path returns same turn
    const idempA = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          kind: "free_text",
          text: "repeatable glance",
          clientActionId: "e2e_idemp",
        }),
      },
    );
    const idempB = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/actions?wait=1`,
      {
        method: "POST",
        headers: player.headers,
        body: JSON.stringify({
          kind: "free_text",
          text: "repeatable glance",
          clientActionId: "e2e_idemp",
        }),
      },
    );
    expect(idempA.ok).toBe(true);
    expect(idempB.ok).toBe(true);
    const turnA = (await idempA.json()) as { turnId: string; status: string };
    const turnB = (await idempB.json()) as { turnId: string; status: string };
    expect(turnA.status).toBe("committed");
    expect(turnB.turnId).toBe(turnA.turnId);

    sse.close();
  }, 60_000);
});

async function pollTurnJob(
  baseUrl: string,
  sessionId: string,
  turnId: string,
  headers: Record<string, string>,
  timeoutMs = 10_000,
): Promise<{
  job: {
    status: string;
    result?: { status: string; passage?: { prose: string } };
  };
}> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const jobRes = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/turns/${turnId}`,
      { headers },
    );
    if (!jobRes.ok) {
      await Bun.sleep(25);
      continue;
    }
    const body = (await jobRes.json()) as {
      job: {
        status: string;
        result?: { status: string; passage?: { prose: string } };
      };
    };
    if (body.job.status !== "running") {
      return body;
    }
    await Bun.sleep(25);
  }
  throw new Error(`turn job ${turnId} still running after ${timeoutMs}ms`);
}
