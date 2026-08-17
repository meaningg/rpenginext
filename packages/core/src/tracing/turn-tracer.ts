import {
  err,
  failure,
  ok,
  type EventBusPort,
  type Failure,
  type JsonObject,
  type Passage,
  type PlayerAction,
  type Result,
  type StateCommand,
  type TraceNote,
  type TraceOutcome,
  type TraceSinkPort,
  type TurnFailure,
  type TurnKind,
  type TurnLogger,
} from "@rpengineext/contracts";

import type { EngineConfig } from "../config/types.ts";
import type { Clock } from "../util/clock.ts";
import type { StateDiffEntry } from "../util/state-diff.ts";
import { renderTurnTraceMarkdown } from "./markdown-renderer.ts";

export interface TraceTimelineRow {
  stage: string;
  status: "ok" | "error" | "skipped";
  durationMs: number;
  notes?: string;
}

export interface TraceAgentRecord {
  taskId: string;
  type: string;
  requester: string;
  status: "ok" | "fail";
  input: JsonObject;
  output?: JsonObject;
  error?: string;
}

export interface TraceToolRecord {
  toolName: string;
  callId: string;
  error?: string;
}

export interface TraceCommandRecord {
  command: StateCommand;
  accepted: boolean;
  reason?: string;
}

export interface TurnTraceDocument {
  turnId: string;
  sessionId: string;
  turnKind: TurnKind;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: TraceOutcome;
  failure?: TurnFailure;
  stateRevisionBefore: number;
  stateRevisionAfter: number;
  enabledModules: readonly { id: string; version: string }[];
  rawInput: PlayerAction;
  normalizedAction?: unknown;
  intent?: unknown;
  timeline: TraceTimelineRow[];
  agents: TraceAgentRecord[];
  toolCalls: TraceToolRecord[];
  commands: TraceCommandRecord[];
  stateDiff: StateDiffEntry[];
  narrativeBrief?: JsonObject;
  narrativeProse?: string;
  passage?: Passage;
  persistenceNote?: string;
  moduleNotes: TraceNote[];
  warnings: string[];
}

/**
 * Collects per-turn diagnostics and flushes a markdown dossier at END.
 */
export class TurnTracer {
  private readonly config: EngineConfig["tracing"];
  private readonly sink: TraceSinkPort;
  private readonly clock: Clock;
  private readonly log: TurnLogger;
  private readonly events?: EventBusPort;
  private doc: TurnTraceDocument | null = null;
  private openMs = 0;
  private lastMarkdown: string | null = null;
  private lastPath: string | null = null;

  /**
   * @param deps - tracer dependencies
   */
  constructor(deps: {
    config: EngineConfig["tracing"];
    sink: TraceSinkPort;
    clock: Clock;
    log: TurnLogger;
    events?: EventBusPort;
  }) {
    this.config = deps.config;
    this.sink = deps.sink;
    this.clock = deps.clock;
    this.log = deps.log.child({ component: "turn-tracer" });
    this.events = deps.events;
  }

  /**
   * Opens a new in-memory trace for a turn.
   */
  open(input: {
    turnId: string;
    sessionId: string;
    turnKind: TurnKind;
    stateRevisionBefore: number;
    enabledModules: readonly { id: string; version: string }[];
    rawInput: PlayerAction;
  }): void {
    if (!this.config.enabled) {
      this.doc = null;
      return;
    }
    this.openMs = this.clock.nowMs();
    this.lastMarkdown = null;
    this.lastPath = null;
    this.doc = {
      turnId: input.turnId,
      sessionId: input.sessionId,
      turnKind: input.turnKind,
      startedAt: this.clock.nowIso(),
      finishedAt: "",
      durationMs: 0,
      outcome: "rejected",
      stateRevisionBefore: input.stateRevisionBefore,
      stateRevisionAfter: input.stateRevisionBefore,
      enabledModules: input.enabledModules,
      rawInput: input.rawInput,
      timeline: [],
      agents: [],
      toolCalls: [],
      commands: [],
      stateDiff: [],
      moduleNotes: [],
      warnings: [],
    };
  }

  /**
   * Records a stage timeline row.
   */
  recordStage(row: TraceTimelineRow): void {
    this.doc?.timeline.push(row);
  }

  /**
   * Records normalized action.
   */
  recordNormalized(action: unknown): void {
    if (this.doc) this.doc.normalizedAction = action;
  }

  /**
   * Records intent.
   */
  recordIntent(intent: unknown): void {
    if (this.doc) this.doc.intent = intent;
  }

  /**
   * Records an agent call.
   */
  recordAgent(record: TraceAgentRecord): void {
    this.doc?.agents.push(record);
  }

  /**
   * Records tool call.
   */
  recordTool(record: TraceToolRecord): void {
    this.doc?.toolCalls.push(record);
  }

  /**
   * Records command validation outcomes.
   */
  recordCommands(records: readonly TraceCommandRecord[]): void {
    if (this.doc) this.doc.commands = [...records];
  }

  /**
   * Records state diff entries.
   */
  recordStateDiff(diff: readonly StateDiffEntry[]): void {
    if (this.doc) this.doc.stateDiff = [...diff];
  }

  /**
   * Records narrative artifacts.
   */
  recordNarrative(brief: JsonObject | undefined, prose: string | undefined): void {
    if (!this.doc) return;
    this.doc.narrativeBrief = brief;
    this.doc.narrativeProse = prose;
  }

  /**
   * Records passage artifact.
   */
  recordPassage(passage: Passage | undefined): void {
    if (this.doc) this.doc.passage = passage;
  }

  /**
   * Records persistence note.
   */
  recordPersistence(note: string): void {
    if (this.doc) this.doc.persistenceNote = note;
  }

  /**
   * Adds a warning.
   */
  warn(message: string): void {
    this.doc?.warnings.push(message);
  }

  /**
   * Module annotation API.
   */
  note(note: TraceNote): void {
    this.doc?.moduleNotes.push(note);
  }

  /**
   * Finalizes outcome, renders markdown, writes sink.
   */
  async finalize(input: {
    outcome: TraceOutcome;
    failure?: TurnFailure;
    stateRevisionAfter: number;
    turnIndex: number;
  }): Promise<Result<{ path?: string; markdown?: string }, Failure>> {
    if (!this.config.enabled || !this.doc) {
      return ok({});
    }

    if (input.outcome === "committed" && !this.config.writeOnCommit) {
      return ok({});
    }
    if (input.outcome === "rejected" && !this.config.writeOnReject) {
      return ok({});
    }

    this.doc.outcome = input.outcome;
    this.doc.failure = input.failure;
    this.doc.stateRevisionAfter = input.stateRevisionAfter;
    this.doc.finishedAt = this.clock.nowIso();
    this.doc.durationMs = Math.max(0, this.clock.nowMs() - this.openMs);

    const markdown = renderTurnTraceMarkdown(this.doc, {
      maxStringFieldChars: this.config.maxStringFieldChars,
      maxArrayItems: this.config.maxArrayItems,
    });
    this.lastMarkdown = markdown;

    const path = `${this.config.directory}/${this.doc.sessionId}/${padTurn(input.turnIndex)}_${this.doc.turnId}_${input.outcome}.md`;
    this.lastPath = path;

    try {
      const written = await this.sink.write(path, markdown);
      if (!written.ok) {
        this.events?.publish({
          type: "trace.write_failed",
          turnId: this.doc.turnId,
          message: written.error.message,
          at: this.clock.nowIso(),
        });
        this.log.error(
          { turnId: this.doc.turnId, err: written.error },
          "trace write failed",
        );
        if (this.config.failTurnOnWriteError) {
          return err(written.error);
        }
        return ok({ path, markdown });
      }
      this.events?.publish({
        type: "trace.finalized",
        turnId: this.doc.turnId,
        outcome: input.outcome,
        path,
        at: this.clock.nowIso(),
      });
      return ok({ path, markdown });
    } catch (error) {
      const message = String(error);
      this.events?.publish({
        type: "trace.write_failed",
        turnId: this.doc.turnId,
        message,
        at: this.clock.nowIso(),
      });
      this.log.error({ turnId: this.doc.turnId, err: message }, "trace write threw");
      if (this.config.failTurnOnWriteError) {
        return err(failure("INTERNAL", "trace write threw", { details: message }));
      }
      return ok({ path, markdown });
    } finally {
      this.doc = null;
    }
  }

  /**
   * Last rendered markdown (tests).
   */
  getLastMarkdown(): string | null {
    return this.lastMarkdown;
  }

  /**
   * Last path (tests).
   */
  getLastPath(): string | null {
    return this.lastPath;
  }
}

function padTurn(turnIndex: number): string {
  return String(Math.max(0, turnIndex)).padStart(5, "0");
}
