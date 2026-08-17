import type {
  EngineEvent,
  EngineEventHandler,
  EngineEventType,
  EventBusPort,
} from "@rpengineext/contracts";

/**
 * In-process observe-only event bus.
 * Subscriber errors are isolated and never mutate world state.
 */
export class EventBus implements EventBusPort {
  private readonly handlers = new Map<
    EngineEventType | "*",
    Set<EngineEventHandler>
  >();

  /**
   * Publishes an event to type-specific and wildcard subscribers.
   *
   * @param event - engine event
   */
  publish(event: EngineEvent): void {
    const specific = this.handlers.get(event.type);
    const wildcard = this.handlers.get("*");
    const targets = [
      ...(specific ? [...specific] : []),
      ...(wildcard ? [...wildcard] : []),
    ];
    for (const handler of targets) {
      try {
        const result = handler(event);
        if (result && typeof (result as Promise<void>).then === "function") {
          void (result as Promise<void>).catch(() => {
            /* observe-only: swallow async handler errors */
          });
        }
      } catch {
        /* observe-only: swallow sync handler errors */
      }
    }
  }

  /**
   * Subscribes to an event type or `*` for all events.
   *
   * @param type - event type filter
   * @param handler - observer callback
   * @returns unsubscribe function
   */
  subscribe(
    type: EngineEventType | "*",
    handler: EngineEventHandler,
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set && set.size === 0) {
        this.handlers.delete(type);
      }
    };
  }
}
