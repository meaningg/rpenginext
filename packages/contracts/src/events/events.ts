import type { TurnFailure } from "../turn/turn-result.ts";
import type { Passage } from "../turn/passage.ts";
import type { TraceOutcome } from "../tracing/port.ts";

/**
 * Observe-only engine events. Subscribers must never mutate world state.
 * @see docs/architecture/02-core.md
 */
export type EngineEvent =
  | {
      readonly type: "turn.started";
      readonly sessionId: string;
      readonly turnId: string;
      readonly at: string;
    }
  | {
      readonly type: "turn.committed";
      readonly sessionId: string;
      readonly turnId: string;
      readonly revision: number;
      readonly passageId: string;
      readonly at: string;
    }
  | {
      readonly type: "turn.rejected";
      readonly sessionId: string;
      readonly turnId: string;
      readonly failure: TurnFailure;
      readonly at: string;
    }
  | {
      readonly type: "module.loaded";
      readonly moduleId: string;
      readonly version: string;
      readonly at: string;
    }
  | {
      readonly type: "turn.stage";
      readonly sessionId: string;
      readonly turnId: string;
      readonly stage: string;
      readonly phase: "started" | "finished";
      readonly ok?: boolean;
      readonly at: string;
    }
  | {
      readonly type: "agent.task.started";
      readonly sessionId?: string;
      readonly turnId: string;
      readonly taskId: string;
      readonly taskType: string;
      readonly at: string;
    }
  | {
      readonly type: "agent.task.finished";
      readonly sessionId?: string;
      readonly turnId?: string;
      readonly taskId: string;
      readonly taskType: string;
      readonly ok: boolean;
      readonly at: string;
    }
  | {
      readonly type: "llm.stream.delta";
      readonly sessionId?: string;
      readonly turnId: string;
      readonly taskId: string;
      readonly taskType: string;
      readonly text: string;
      readonly at: string;
    }
  | {
      readonly type: "state.committed";
      readonly sessionId: string;
      readonly revision: number;
      readonly at: string;
    }
  | {
      readonly type: "trace.finalized";
      readonly turnId: string;
      readonly outcome: TraceOutcome;
      readonly path?: string;
      readonly at: string;
    }
  | {
      readonly type: "trace.write_failed";
      readonly turnId: string;
      readonly message: string;
      readonly at: string;
    }
  | {
      readonly type: "passage.published";
      readonly sessionId: string;
      readonly passage: Passage;
      readonly at: string;
    };

export type EngineEventType = EngineEvent["type"];

/**
 * Observer callback for the core EventBus.
 */
export type EngineEventHandler = (event: EngineEvent) => void | Promise<void>;

/**
 * Observe-only bus port (implementation in core).
 */
export interface EventBusPort {
  publish(event: EngineEvent): void;
  subscribe(type: EngineEventType | "*", handler: EngineEventHandler): () => void;
}
