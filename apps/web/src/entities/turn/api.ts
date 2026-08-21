import { authHeaders, http } from "../../shared/api/http.ts";
import type { PlayerCredentials } from "../player/model.ts";
import type { AsyncTurnAccepted, TurnResult } from "./model.ts";

/**
 * Submits a free-text player action.
 *
 * @param player - credentials
 * @param sessionId - session id
 * @param body - action payload
 * @param wait - wait for turn completion
 */
export async function submitAction(
  player: PlayerCredentials,
  sessionId: string,
  body: { kind?: "free_text"; text: string; clientActionId?: string },
  wait = false,
): Promise<TurnResult | AsyncTurnAccepted> {
  const qs = wait ? "?wait=1" : "";
  return http(
    `/v1/sessions/${encodeURIComponent(sessionId)}/actions${qs}`,
    {
      method: "POST",
      player,
      body: {
        kind: "free_text",
        text: body.text,
        ...(body.clientActionId
          ? { clientActionId: body.clientActionId }
          : {}),
      },
    },
  );
}

/**
 * Opens SSE for a session. Returns close function.
 *
 * Stream deltas yield a paint frame between events so the chat UI can
 * render progressive prose even when the proxy delivers a burst of chunks.
 *
 * @param player - credentials
 * @param sessionId - session id
 * @param onEvent - event handler
 * @param onError - optional error handler
 */
export function openSessionEvents(
  player: PlayerCredentials,
  sessionId: string,
  onEvent: (eventName: string, data: unknown) => void,
  onError?: (error: Event) => void,
): () => void {
  const controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(
        `/v1/sessions/${encodeURIComponent(sessionId)}/events`,
        {
          headers: {
            ...authHeaders(player),
            Accept: "text/event-stream",
          },
          signal: controller.signal,
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
