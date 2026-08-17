import type { EngineEvent } from "@rpengineext/contracts";
import type { EventBus } from "@rpengineext/core";

export type HostSsePayload =
  | {
      readonly type: "ready";
      readonly sessionId: string;
      readonly at: string;
    }
  | {
      readonly type: "heartbeat";
      readonly at: string;
    }
  | {
      readonly type: "engine";
      readonly event: EngineEvent;
    };

interface Subscriber {
  readonly sessionId: string;
  readonly enqueue: (chunk: string) => void;
  readonly close: () => void;
}

/**
 * Fans engine EventBus events out to per-session SSE subscribers.
 */
export class SseHub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly unsubscribe: () => void;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * @param events - engine event bus
   * @param heartbeatMs - heartbeat interval
   */
  constructor(
    events: EventBus,
    private readonly heartbeatMs = 15_000,
  ) {
    this.unsubscribe = events.subscribe("*", (event) => {
      this.broadcastEngine(event);
    });
    this.heartbeatTimer = setInterval(() => {
      this.broadcastAll({
        type: "heartbeat",
        at: new Date().toISOString(),
      });
    }, this.heartbeatMs);
  }

  /**
   * Opens an SSE stream for a session.
   *
   * @param sessionId - session filter
   * @param request - request (for abort)
   * @param server - Bun server for timeout disable
   */
  openStream(
    sessionId: string,
    request: Request,
    server?: { timeout: (req: Request, seconds: number) => void },
  ): Response {
    server?.timeout(request, 0);

    let sub: Subscriber | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        const enqueue = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            /* closed */
          }
        };
        const close = () => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        sub = { sessionId, enqueue, close };
        this.subscribers.add(sub);
        enqueue(formatSse({
          type: "ready",
          sessionId,
          at: new Date().toISOString(),
        }));

        const onAbort = () => {
          if (sub) this.subscribers.delete(sub);
          close();
        };
        request.signal.addEventListener("abort", onAbort, { once: true });
      },
      cancel: () => {
        if (sub) this.subscribers.delete(sub);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  /**
   * Stops hub timers and bus subscription.
   */
  close(): void {
    this.unsubscribe();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const sub of this.subscribers) {
      sub.close();
    }
    this.subscribers.clear();
  }

  private broadcastEngine(event: EngineEvent): void {
    const sessionId = "sessionId" in event ? event.sessionId : undefined;
    if (!sessionId) {
      // agent events may omit sessionId; fan out by turn subscribers is hard —
      // send only to all is too noisy; skip if no sessionId
      if (
        event.type === "agent.task.started" ||
        event.type === "agent.task.finished" ||
        event.type === "llm.stream.delta"
      ) {
        // still try optional sessionId
        const sid = event.sessionId;
        if (!sid) return;
        this.broadcastToSession(sid, { type: "engine", event });
        return;
      }
      return;
    }
    this.broadcastToSession(sessionId, { type: "engine", event });
  }

  private broadcastToSession(sessionId: string, payload: HostSsePayload): void {
    const data = formatSse(payload);
    for (const sub of this.subscribers) {
      if (sub.sessionId === sessionId) {
        sub.enqueue(data);
      }
    }
  }

  private broadcastAll(payload: HostSsePayload): void {
    const data = formatSse(payload);
    for (const sub of this.subscribers) {
      sub.enqueue(data);
    }
  }
}

function formatSse(payload: HostSsePayload): string {
  const eventName = payload.type === "engine" ? payload.event.type : payload.type;
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}
