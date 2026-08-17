const PLAYER_KEY = "rp.player";

export interface PlayerCredentials {
  playerId: string;
  token: string;
  displayName: string;
}

export interface StoryTemplateSummary {
  id: string;
  version: string;
  title: string;
  synopsis: string;
  tags: string[];
  locale?: string;
}

export interface Passage {
  id: string;
  turnId: string;
  prose: string;
  visibleState?: Record<string, unknown>;
}

export interface SessionSummary {
  sessionId: string;
  playerId: string;
  templateId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionView extends SessionSummary {
  passage: Passage | null;
}

export interface TurnResultCommitted {
  status: "committed";
  turnId: string;
  sessionId: string;
  revision: number;
  passage: Passage;
  warnings?: string[];
}

export interface TurnResultRejected {
  status: "rejected";
  turnId: string;
  sessionId: string;
  failure: { code: string; message: string };
  warnings?: string[];
}

export type TurnResult = TurnResultCommitted | TurnResultRejected;

function authHeaders(player: PlayerCredentials): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${player.token}`,
    "X-Player-Id": player.playerId,
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const err = data as { error?: { message?: string; code?: string } };
    throw new Error(err.error?.message ?? `HTTP ${response.status}`);
  }
  return data as T;
}

export function loadPlayer(): PlayerCredentials | null {
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerCredentials;
  } catch {
    return null;
  }
}

export function savePlayer(player: PlayerCredentials): void {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

export async function ensurePlayer(
  displayName = "Reader",
): Promise<PlayerCredentials> {
  const existing = loadPlayer();
  if (existing) return existing;
  const response = await fetch("/v1/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  const data = await parseJson<{
    playerId: string;
    token: string;
    displayName: string;
  }>(response);
  const player = {
    playerId: data.playerId,
    token: data.token,
    displayName: data.displayName,
  };
  savePlayer(player);
  return player;
}

export async function listTemplates(): Promise<StoryTemplateSummary[]> {
  const response = await fetch("/v1/templates");
  const data = await parseJson<{ templates: StoryTemplateSummary[] }>(response);
  return data.templates;
}

export async function listSessions(
  player: PlayerCredentials,
): Promise<SessionSummary[]> {
  const response = await fetch("/v1/sessions", {
    headers: authHeaders(player),
  });
  const data = await parseJson<{ sessions: SessionSummary[] }>(response);
  return data.sessions;
}

export async function createSession(
  player: PlayerCredentials,
  templateId: string,
  title?: string,
): Promise<{ session: SessionView; openingTurn?: TurnResult }> {
  const response = await fetch("/v1/sessions", {
    method: "POST",
    headers: authHeaders(player),
    body: JSON.stringify({ templateId, title, runOpening: true }),
  });
  return parseJson(response);
}

export async function getSession(
  player: PlayerCredentials,
  sessionId: string,
): Promise<SessionView> {
  const response = await fetch(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(player),
  });
  const data = await parseJson<{ session: SessionView }>(response);
  return data.session;
}

export async function submitAction(
  player: PlayerCredentials,
  sessionId: string,
  body: { kind?: "free_text"; text: string; clientActionId?: string },
  wait = false,
): Promise<TurnResult | { mode: "async"; turnId: string; sessionId: string }> {
  const qs = wait ? "?wait=1" : "";
  const response = await fetch(
    `/v1/sessions/${encodeURIComponent(sessionId)}/actions${qs}`,
    {
      method: "POST",
      headers: authHeaders(player),
      body: JSON.stringify({
        kind: "free_text",
        text: body.text,
        ...(body.clientActionId
          ? { clientActionId: body.clientActionId }
          : {}),
      }),
    },
  );
  return parseJson(response);
}

export async function saveSession(
  player: PlayerCredentials,
  sessionId: string,
): Promise<{ revision: number; savedAt: string }> {
  const response = await fetch(
    `/v1/sessions/${encodeURIComponent(sessionId)}/save`,
    {
      method: "POST",
      headers: authHeaders(player),
    },
  );
  return parseJson(response);
}

/**
 * Opens SSE for a session. Returns close function.
 *
 * Stream deltas yield a paint frame between events so the chat UI can
 * render progressive prose even when the proxy delivers a burst of chunks.
 */
export function openSessionEvents(
  player: PlayerCredentials,
  sessionId: string,
  onEvent: (eventName: string, data: unknown) => void,
  onError?: (error: Event) => void,
): () => void {
  // EventSource cannot set custom headers; use fetch stream instead.
  const controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(
        `/v1/sessions/${encodeURIComponent(sessionId)}/events`,
        {
          headers: {
            Authorization: `Bearer ${player.token}`,
            "X-Player-Id": player.playerId,
            Accept: "text/event-stream",
          },
          signal: controller.signal,
          // Avoid any intermediate caching of the event stream.
          cache: "no-store",
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(`SSE HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (controller.signal.aborted) return;
          const lines = chunk.split("\n");
          let dataLine = "";
          let eventName = "message";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              // Keep payload as-is (only strip the single leading space after "data:").
              const payload = line.startsWith("data: ")
                ? line.slice(6)
                : line.slice(5);
              dataLine += payload;
            }
          }
          if (!dataLine) continue;
          try {
            onEvent(eventName, JSON.parse(dataLine));
          } catch {
            onEvent(eventName, dataLine);
          }
          // Allow React to commit streaming tokens between bursted SSE events.
          if (
            eventName === "llm.stream.delta" ||
            eventName === "turn.stage" ||
            eventName === "agent.task.started"
          ) {
            await waitForPaint();
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      onError?.(error as Event);
    }
  })();

  return () => controller.abort();
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}
