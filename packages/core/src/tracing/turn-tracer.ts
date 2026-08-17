import {
  err,
  failure,
  ok,
  type EventBusPort,
  type Failure,
  type JsonObject,
  type LlmMessage,
  type Passage,
  type PlayerAction,
  type Result,
  type StateCommand,
  type TokenUsage,
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
  /** Rendered LLM chat messages (system/user/history/tools) when includePrompts. */
  prompts?: readonly LlmMessage[];
  /** Raw model text before parse/schema when includeRawModelOutput. */
  rawModelOutput?: string;
  model?: string;
  usage?: TokenUsage;
  durationMs?: number;
  repaired?: boolean;
}

export interface TraceToolRecord {
  toolName: string;
  callId: string;
  /** Agent task that invoked the tool, when known. */
  parentTaskId?: string;
  args?: JsonObject;
  result?: JsonObject;
  error?: string;
  durationMs?: number;
}

export interface TraceCommandRecord {
  command: StateCommand;
  accepted: boolean;
  reason?: string;
}

/**
 * Nested system/restore follow-up recorded into the parent player dossier.
 */
export interface TraceFollowUpRecord {
  turnId: string;
  turnKind: TurnKind;
  reason: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: TraceOutcome;
  failure?: TurnFailure;
  stateRevisionBefore: number;
  stateRevisionAfter: number;
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
  /** Scheduled system turns merged into this dossier (same file). */
  followUps: TraceFollowUpRecord[];
}

type ActiveBucket = {
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
  normalizedAction?: unknown;
  intent?: unknown;
};

/**
 * Collects per-turn diagnostics and flushes a markdown dossier at END.
 *
 * Player turns own the file. Follow-up system turns (outfit_sync, etc.) attach
 * into the same dossier instead of writing a second `.md`.
 */
export class TurnTracer {
  private readonly config: EngineConfig["tracing"];
  private readonly sink: TraceSinkPort;
  private readonly clock: Clock;
  private readonly log: TurnLogger;
  private readonly events?: EventBusPort;

  /** Root (usually player) document kept for follow-up attach. */
  private rootDoc: TurnTraceDocument | null = null;
  private rootOpenMs = 0;
  private rootTurnIndex = 0;
  private rootPath: string | null = null;

  /** Active follow-up being recorded, if any. */
  private followUp: {
    turnId: string;
    turnKind: TurnKind;
    reason: string;
    startedAt: string;
    openMs: number;
    stateRevisionBefore: number;
    bucket: ActiveBucket;
  } | null = null;

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
   * Opens a new root in-memory trace for a turn.
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
      this.rootDoc = null;
      this.followUp = null;
      return;
    }
    this.followUp = null;
    this.rootOpenMs = this.clock.nowMs();
    this.rootTurnIndex = 0;
    this.rootPath = null;
    this.lastMarkdown = null;
    this.lastPath = null;
    this.rootDoc = {
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
      followUps: [],
    };
  }

  /**
   * Opens a follow-up section on the last finalized root dossier (same file).
   *
   * @returns true when attached; false when a standalone root should be opened instead
   */
  openFollowUp(input: {
    turnId: string;
    turnKind: TurnKind;
    reason: string;
    stateRevisionBefore: number;
  }): boolean {
    if (!this.config.enabled || !this.rootDoc || !this.rootPath) {
      return false;
    }
    this.followUp = {
      turnId: input.turnId,
      turnKind: input.turnKind,
      reason: input.reason,
      startedAt: this.clock.nowIso(),
      openMs: this.clock.nowMs(),
      stateRevisionBefore: input.stateRevisionBefore,
      bucket: emptyBucket(),
    };
    return true;
  }

  /**
   * Whether a follow-up section is currently being recorded.
   */
  isRecordingFollowUp(): boolean {
    return this.followUp !== null;
  }

  /**
   * Records a stage timeline row.
   */
  recordStage(row: TraceTimelineRow): void {
    this.activeBucket()?.timeline.push(row);
  }

  /**
   * Records normalized action.
   */
  recordNormalized(action: unknown): void {
    const bucket = this.activeBucket();
    if (!bucket) return;
    if (this.followUp) {
      bucket.normalizedAction = action;
      return;
    }
    if (this.rootDoc) this.rootDoc.normalizedAction = action;
  }

  /**
   * Records intent.
   */
  recordIntent(intent: unknown): void {
    const bucket = this.activeBucket();
    if (!bucket) return;
    if (this.followUp) {
      bucket.intent = intent;
      return;
    }
    if (this.rootDoc) this.rootDoc.intent = intent;
  }

  /**
   * Records an agent call.
   */
  recordAgent(record: TraceAgentRecord): void {
    this.activeBucket()?.agents.push(record);
  }

  /**
   * Records tool call with args/result when available.
   */
  recordTool(record: TraceToolRecord): void {
    this.activeBucket()?.toolCalls.push(record);
  }

  /**
   * Records command validation outcomes.
   */
  recordCommands(records: readonly TraceCommandRecord[]): void {
    const bucket = this.activeBucket();
    if (bucket) bucket.commands = [...records];
  }

  /**
   * Records state diff entries.
   */
  recordStateDiff(diff: readonly StateDiffEntry[]): void {
    const bucket = this.activeBucket();
    if (bucket) bucket.stateDiff = [...diff];
  }

  /**
   * Records narrative artifacts.
   */
  recordNarrative(
    brief: JsonObject | undefined,
    prose: string | undefined,
  ): void {
    const bucket = this.activeBucket();
    if (!bucket) return;
    bucket.narrativeBrief = brief;
    bucket.narrativeProse = prose;
  }

  /**
   * Records passage artifact.
   */
  recordPassage(passage: Passage | undefined): void {
    const bucket = this.activeBucket();
    if (bucket) bucket.passage = passage;
  }

  /**
   * Records persistence note.
   */
  recordPersistence(note: string): void {
    const bucket = this.activeBucket();
    if (bucket) bucket.persistenceNote = note;
  }

  /**
   * Adds a warning.
   */
  warn(message: string): void {
    this.activeBucket()?.warnings.push(message);
  }

  /**
   * Module annotation API.
   */
  note(note: TraceNote): void {
    this.activeBucket()?.moduleNotes.push(note);
  }

  /**
   * Finalizes outcome, renders markdown, writes sink.
   *
   * Root finalize writes a new file. Follow-up finalize rewrites the root file
   * with an extra section (no second path).
   */
  async finalize(input: {
    outcome: TraceOutcome;
    failure?: TurnFailure;
    stateRevisionAfter: number;
    turnIndex: number;
  }): Promise<Result<{ path?: string; markdown?: string }, Failure>> {
    if (!this.config.enabled || !this.rootDoc) {
      this.followUp = null;
      return ok({});
    }

    if (input.outcome === "committed" && !this.config.writeOnCommit) {
      this.followUp = null;
      return ok({});
    }
    if (input.outcome === "rejected" && !this.config.writeOnReject) {
      this.followUp = null;
      return ok({});
    }

    if (this.followUp) {
      return this.finalizeFollowUp(input);
    }

    this.rootDoc.outcome = input.outcome;
    this.rootDoc.failure = input.failure;
    this.rootDoc.stateRevisionAfter = input.stateRevisionAfter;
    this.rootDoc.finishedAt = this.clock.nowIso();
    this.rootDoc.durationMs = Math.max(0, this.clock.nowMs() - this.rootOpenMs);
    this.rootTurnIndex = input.turnIndex;

    const path = `${this.config.directory}/${this.rootDoc.sessionId}/${padTurn(input.turnIndex)}_${this.rootDoc.turnId}_${input.outcome}.md`;
    this.rootPath = path;
    return this.flush(path, this.rootDoc.turnId, input.outcome);
  }

  /**
   * Last rendered markdown (tests / CLI).
   */
  getLastMarkdown(): string | null {
    return this.lastMarkdown;
  }

  /**
   * Last path (tests / CLI).
   */
  getLastPath(): string | null {
    return this.lastPath;
  }

  private async finalizeFollowUp(input: {
    outcome: TraceOutcome;
    failure?: TurnFailure;
    stateRevisionAfter: number;
    turnIndex: number;
  }): Promise<Result<{ path?: string; markdown?: string }, Failure>> {
    const fu = this.followUp;
    const root = this.rootDoc;
    if (!fu || !root || !this.rootPath) {
      this.followUp = null;
      return ok({});
    }

    const record: TraceFollowUpRecord = {
      turnId: fu.turnId,
      turnKind: fu.turnKind,
      reason: fu.reason,
      startedAt: fu.startedAt,
      finishedAt: this.clock.nowIso(),
      durationMs: Math.max(0, this.clock.nowMs() - fu.openMs),
      outcome: input.outcome,
      failure: input.failure,
      stateRevisionBefore: fu.stateRevisionBefore,
      stateRevisionAfter: input.stateRevisionAfter,
      timeline: fu.bucket.timeline,
      agents: fu.bucket.agents,
      toolCalls: fu.bucket.toolCalls,
      commands: fu.bucket.commands,
      stateDiff: fu.bucket.stateDiff,
      narrativeBrief: fu.bucket.narrativeBrief,
      narrativeProse: fu.bucket.narrativeProse,
      passage: fu.bucket.passage,
      persistenceNote: fu.bucket.persistenceNote,
      moduleNotes: fu.bucket.moduleNotes,
      warnings: fu.bucket.warnings,
    };
    root.followUps.push(record);
    // Keep root finishedAt as wall-clock of latest follow-up for operator scanning.
    root.finishedAt = record.finishedAt;
    root.durationMs = Math.max(
      root.durationMs,
      Math.max(0, this.clock.nowMs() - this.rootOpenMs),
    );
    this.followUp = null;

    // Always rewrite the same root path (no second file).
    return this.flush(this.rootPath, root.turnId, root.outcome);
  }

  private async flush(
    path: string,
    turnId: string,
    outcome: TraceOutcome,
  ): Promise<Result<{ path?: string; markdown?: string }, Failure>> {
    if (!this.rootDoc) return ok({});

    const markdown = renderTurnTraceMarkdown(this.rootDoc, {
      maxStringFieldChars: this.config.maxStringFieldChars,
      maxArrayItems: this.config.maxArrayItems,
    });
    this.lastMarkdown = markdown;
    this.lastPath = path;

    try {
      const written = await this.sink.write(path, markdown);
      if (!written.ok) {
        this.events?.publish({
          type: "trace.write_failed",
          turnId,
          message: written.error.message,
          at: this.clock.nowIso(),
        });
        this.log.error({ turnId, err: written.error }, "trace write failed");
        if (this.config.failTurnOnWriteError) {
          return err(written.error);
        }
        return ok({ path, markdown });
      }
      this.events?.publish({
        type: "trace.finalized",
        turnId,
        outcome,
        path,
        at: this.clock.nowIso(),
      });
      return ok({ path, markdown });
    } catch (error) {
      const message = String(error);
      this.events?.publish({
        type: "trace.write_failed",
        turnId,
        message,
        at: this.clock.nowIso(),
      });
      this.log.error({ turnId, err: message }, "trace write threw");
      if (this.config.failTurnOnWriteError) {
        return err(
          failure("INTERNAL", "trace write threw", { details: message }),
        );
      }
      return ok({ path, markdown });
    }
  }

  private activeBucket(): ActiveBucket | null {
    if (!this.config.enabled) return null;
    if (this.followUp) return this.followUp.bucket;
    if (!this.rootDoc) return null;
    return this.rootDoc;
  }
}

function emptyBucket(): ActiveBucket {
  return {
    timeline: [],
    agents: [],
    toolCalls: [],
    commands: [],
    stateDiff: [],
    moduleNotes: [],
    warnings: [],
  };
}

function padTurn(turnIndex: number): string {
  return String(Math.max(0, turnIndex)).padStart(5, "0");
}
