import type { Result, Failure } from "./result.ts";
import type { Module } from "./modules/module.ts";
import type { ModuleFactory } from "./modules/module.ts";
import type { PlayerAction } from "./turn/action.ts";
import type { Passage } from "./turn/passage.ts";
import type { TurnResult } from "./turn/turn-result.ts";
import type { PersistencePort, SavePointer } from "./persistence/port.ts";
import type { LlmPort } from "./agents/llm-port.ts";
import type { TraceSinkPort } from "./tracing/port.ts";
import type { EventBusPort } from "./events/events.ts";
import type { TurnLogger } from "./turn/context.ts";
import type { JsonObject } from "./json.ts";

/**
 * Host-facing session handle (logical API).
 * @see docs/architecture/02-core.md
 */
export interface Session {
  readonly sessionId: string;
  submitAction(action: PlayerAction): Promise<TurnResult>;
  getPassage(): Promise<Result<Passage | null, Failure>>;
  save(): Promise<Result<SavePointer, Failure>>;
  stop(): Promise<Result<void, Failure>>;
}

/**
 * Engine facade constructed by core `createEngine`.
 */
export interface Engine {
  startSession(spec?: NewSessionSpec): Promise<Result<Session, Failure>>;
  loadSession(sessionId: string): Promise<Result<Session, Failure>>;
  submitAction(
    sessionId: string,
    action: PlayerAction,
  ): Promise<TurnResult>;
  getPassage(sessionId: string): Promise<Result<Passage | null, Failure>>;
  save(sessionId: string): Promise<Result<SavePointer, Failure>>;
  stopSession(sessionId: string): Promise<Result<void, Failure>>;
  stop(): Promise<Result<void, Failure>>;
}

/**
 * Spec for creating a new game session.
 */
export interface NewSessionSpec {
  readonly sessionId?: string;
  readonly seed?: string;
  readonly modules?: readonly Module[] | readonly ModuleFactory[];
  readonly meta?: JsonObject;
}

/**
 * Dependency bag accepted by core composition root (shape only).
 * Concrete config parsing lives in core/host.
 */
export interface EngineDependencies {
  readonly log: TurnLogger;
  readonly persistence: PersistencePort;
  readonly llm?: LlmPort;
  readonly traceSink?: TraceSinkPort;
  readonly events?: EventBusPort;
}
