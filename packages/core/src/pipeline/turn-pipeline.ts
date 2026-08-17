import {
  CORE_COMMAND_TYPES,
  STAGE_IDS,
  agentCallPermission,
  emptyJsonObject,
  err,
  failure,
  hasPermission,
  ok,
  proposePermissionForSlice,
  type ActionIntent,
  type AgentTask,
  type Choice,
  type EventBusPort,
  type Failure,
  type InterceptorEffect,
  type JournalEntry,
  type JsonObject,
  type NormalizedAction,
  type Passage,
  type PermissionToken,
  type PersistencePort,
  type PlayerAction,
  type Result,
  type StageId,
  type StateCommand,
  type TurnFailure,
  type TurnKind,
  type TurnLogger,
  type TurnResult,
  type WorldState,
} from "@rpengineext/contracts";

import type { AgentOrchestrator } from "../agents/agent-orchestrator.ts";
import type { EngineConfig } from "../config/types.ts";
import type { ContributionIndex } from "../registry/contribution-index.ts";
import type { StateKernel } from "../state/state-kernel.ts";
import type { TurnTracer } from "../tracing/turn-tracer.ts";
import type { Clock } from "../util/clock.ts";
import { createCommandId, createPassageId, createTaskId } from "../util/ids.ts";
import { createSeededRng } from "../util/rng.ts";
import { diffWorldState } from "../util/state-diff.ts";
import { deepClone } from "../util/clone.ts";
import { withTimeout } from "../util/with-timeout.ts";
import { commandTouchesConflictKey } from "./conflict-paths.ts";
import {
  createCorePermissionChecker,
  createModulePermissionChecker,
  createTurnContext,
  withPermissions,
  type MutableExtras,
} from "./turn-context.ts";

export interface PendingSystemTurn {
  readonly reason: string;
  readonly payload?: JsonObject;
  readonly requestedByModuleId?: string;
}

export interface SessionTurnState {
  sessionId: string;
  kernel: StateKernel;
  lastPassage: Passage | null;
  passages: Map<string, Passage>;
  enabledModules: readonly { id: string; version: string }[];
  seed?: string;
  createdAt: string;
  idempotency: Map<string, TurnResult>;
  /** FIFO of follow-up system turns scheduled after successful player commits. */
  pendingSystemTurns: PendingSystemTurn[];
  meta?: JsonObject;
}

export interface TurnPipelineDeps {
  readonly log: TurnLogger;
  readonly clock: Clock;
  readonly config: EngineConfig;
  readonly index: ContributionIndex;
  readonly orchestrator: AgentOrchestrator;
  readonly tracer: TurnTracer;
  readonly persistence: PersistencePort;
  readonly events: EventBusPort;
  readonly coreVersion: string;
  readonly contractsVersion: string;
  readonly getModulePermissions: (moduleId: string) => readonly PermissionToken[];
}

interface TurnScratch {
  turnId: string;
  sessionId: string;
  kind: TurnKind;
  rawAction: PlayerAction;
  s0: WorldState;
  normalized?: NormalizedAction;
  intent?: ActionIntent;
  proposedCommands: StateCommand[];
  acceptedCommands: StateCommand[];
  warnings: string[];
  extras: MutableExtras;
  planArtifacts: JsonObject;
  narrativeBrief?: JsonObject;
  narrativeProse?: string;
  choiceDrafts: Choice[];
  passage?: Passage;
  failure?: TurnFailure;
  outcome: "pending" | "committed" | "rejected";
  queuedTasks: AgentTask[];
  proposeOpen: boolean;
  /** requestAgent allowed (normalize/plan/propose/narrate). */
  agentOpen: boolean;
  /** interceptor enqueueAgentTask allowed (plan/propose/narrate only). */
  agentQueueOpen: boolean;
  scheduledSystemTurns: PendingSystemTurn[];
}

/**
 * Fixed-stage full-atomic turn pipeline.
 */
export class TurnPipeline {
  private readonly log: TurnLogger;
  private readonly clock: Clock;
  private readonly config: EngineConfig;
  private readonly index: ContributionIndex;
  private readonly orchestrator: AgentOrchestrator;
  private readonly tracer: TurnTracer;
  private readonly persistence: PersistencePort;
  private readonly events: EventBusPort;
  private readonly coreVersion: string;
  private readonly contractsVersion: string;
  private readonly getModulePermissions: (
    moduleId: string,
  ) => readonly PermissionToken[];

  /**
   * @param deps - pipeline dependencies
   */
  constructor(deps: TurnPipelineDeps) {
    this.log = deps.log.child({ component: "turn-pipeline" });
    this.clock = deps.clock;
    this.config = deps.config;
    this.index = deps.index;
    this.orchestrator = deps.orchestrator;
    this.tracer = deps.tracer;
    this.persistence = deps.persistence;
    this.events = deps.events;
    this.coreVersion = deps.coreVersion;
    this.contractsVersion = deps.contractsVersion;
    this.getModulePermissions = deps.getModulePermissions;
  }

  /**
   * Runs one atomic player/system/restore turn.
   *
   * @param session - session turn state
   * @param action - player action
   * @param turnId - preallocated turn id
   * @param kind - turn kind
   */
  async run(
    session: SessionTurnState,
    action: PlayerAction,
    turnId: string,
    kind: TurnKind = "player",
  ): Promise<TurnResult> {
    const s0 = session.kernel.getAuthoritative() as WorldState;
    const scratch: TurnScratch = {
      turnId,
      sessionId: session.sessionId,
      kind,
      rawAction: action,
      s0,
      proposedCommands: [],
      acceptedCommands: [],
      warnings: [],
      extras: {},
      planArtifacts: {},
      choiceDrafts: [],
      outcome: "pending",
      queuedTasks: [],
      proposeOpen: false,
      agentOpen: false,
      agentQueueOpen: false,
      scheduledSystemTurns: [],
    };

    const rng = createSeededRng(session.seed ?? `${session.sessionId}:${turnId}`);
    const ctx = createTurnContext({
      turnId,
      sessionId: session.sessionId,
      getStateView: () =>
        session.kernel.hasOpenDraft()
          ? (session.kernel.getDraftView() as WorldState)
          : s0,
      propose: (commands) => {
        if (!scratch.proposeOpen) {
          return err(
            failure(
              "INTERNAL",
              "propose() is only allowed during the draft propose window",
            ),
          );
        }
        const checked = this.checkCommandPermissions(commands);
        if (!checked.ok) return checked;
        scratch.proposedCommands.push(...commands);
        return ok(undefined);
      },
      requestAgent: async (task) => {
        if (!scratch.agentOpen) {
          return {
            ok: false,
            taskId: task.taskId,
            error: {
              code: "STAGE_POLICY",
              message: "requestAgent() not allowed in this stage",
            },
          };
        }
        if (scratch.kind === "restore") {
          return {
            ok: false,
            taskId: task.taskId,
            error: {
              code: "STAGE_POLICY",
              message: "agents disabled on restore turns",
            },
          };
        }
        if (
          task.requester.kind === "module" &&
          !hasPermission(
            this.getModulePermissions(task.requester.id),
            agentCallPermission(task.type),
          )
        ) {
          return {
            ok: false,
            taskId: task.taskId,
            error: {
              code: "PERMISSION_DENIED",
              message: `module ${task.requester.id} lacks ${agentCallPermission(task.type)}`,
            },
          };
        }
        const result = await this.orchestrator.execute(task);
        this.tracer.recordAgent({
          taskId: task.taskId,
          type: task.type,
          requester: `${task.requester.kind}:${task.requester.id}`,
          status: result.ok ? "ok" : "fail",
          input: task.input,
          output: result.ok ? result.data : undefined,
          error: result.ok ? undefined : result.error.message,
        });
        for (const tool of this.orchestrator.drainToolCalls()) {
          this.tracer.recordTool({
            toolName: tool.toolName,
            callId: tool.callId,
            error: tool.error,
          });
        }
        return result;
      },
      note: (note) => this.tracer.note(note),
      extras: scratch.extras,
      log: this.log.child({ turnId, sessionId: session.sessionId }),
      rng,
      permissions: createCorePermissionChecker(),
    });

    this.orchestrator.beginTurn(ctx);

    this.tracer.open({
      turnId,
      sessionId: session.sessionId,
      turnKind: kind,
      stateRevisionBefore: s0.meta.revision,
      enabledModules: session.enabledModules,
      rawInput: action,
    });

    this.events.publish({
      type: "turn.started",
      sessionId: session.sessionId,
      turnId,
      at: this.clock.nowIso(),
    });

    const begin = session.kernel.beginTurn(turnId);
    if (!begin.ok) {
      scratch.failure = toTurnFailure(turnId, begin.error, "begin");
      scratch.outcome = "rejected";
      const rejected = await this.finishRejected(session, scratch);
      this.orchestrator.endTurn();
      return rejected;
    }

    for (const stage of STAGE_IDS) {
      if (stage === "end") continue;
      if (scratch.outcome === "rejected") break;
      if (stage === "after" && scratch.outcome !== "committed") continue;
      if (scratch.outcome === "committed" && stage !== "after") {
        continue;
      }

      const stageResult = await this.runStage(stage, session, scratch, ctx);
      if (!stageResult.ok) {
        if (stage === "after" && scratch.outcome === "committed") {
          this.log.warn(
            { err: stageResult.error },
            "AFTER stage error ignored after commit",
          );
          this.tracer.warn(`AFTER ignored: ${stageResult.error.message}`);
          continue;
        }
        scratch.failure = toTurnFailure(turnId, stageResult.error, stage);
        scratch.outcome = "rejected";
        session.kernel.discard();
        await this.runOnRejected(scratch, ctx);
        break;
      }
      if (stage === "commit") {
        scratch.outcome = "committed";
      }
    }

    // END interceptors (observe / best-effort)
    await this.runNamedInterceptors("turn.end", "after", scratch, ctx);
    await this.runNamedInterceptors("end", "after", scratch, ctx);

    if (scratch.outcome === "committed") {
      if (scratch.scheduledSystemTurns.length > 0) {
        session.pendingSystemTurns.push(...scratch.scheduledSystemTurns);
      }
      const result = await this.finishCommitted(session, scratch);
      this.orchestrator.endTurn();
      return result;
    }
    if (scratch.outcome === "pending") {
      scratch.failure = {
        turnId,
        code: "INTERNAL",
        message: "turn ended without commit",
        stage: "end",
      };
      scratch.outcome = "rejected";
      session.kernel.discard();
    }
    const rejected = await this.finishRejected(session, scratch);
    this.orchestrator.endTurn();
    return rejected;
  }

  /**
   * Module-scoped TurnContext so handlers see their own permission grants.
   */
  private moduleCtx(
    moduleId: string,
    ctx: ReturnType<typeof createTurnContext>,
  ): ReturnType<typeof createTurnContext> {
    return withPermissions(
      ctx,
      createModulePermissionChecker(this.getModulePermissions(moduleId)),
    ) as ReturnType<typeof createTurnContext>;
  }

  private async runStage(
    stage: StageId,
    session: SessionTurnState,
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const started = this.clock.nowMs();
    scratch.proposeOpen = stage === "propose" || stage === "validate_commands";
    scratch.agentOpen =
      stage === "normalize" ||
      stage === "plan" ||
      stage === "narrate" ||
      stage === "propose";
    scratch.agentQueueOpen =
      stage === "plan" || stage === "propose" || stage === "narrate";

    const timeoutMs = this.config.turn.stageTimeoutsMs[stage] ?? 0;

    const isAgentStage = scratch.agentQueueOpen;

    const run = async (): Promise<Result<void, Failure>> => {
      const before = await this.runInterceptors(stage, "before", scratch, ctx);
      if (!before.ok) return before;

      // Drain tasks enqueued by before-interceptors (plan also collects inside body).
      if (isAgentStage && stage !== "plan") {
        const preDrain = await this.drainQueuedAgents(scratch, ctx);
        if (!preDrain.ok) return preDrain;
      }

      try {
        const body = await this.stageBody(stage, session, scratch, ctx);
        if (!body.ok) {
          await this.runInterceptors(stage, "onError", scratch, ctx, body.error);
          return body;
        }
        const after = await this.runInterceptors(stage, "after", scratch, ctx);
        if (!after.ok) return after;

        // Drain tasks enqueued by after-interceptors on agent stages.
        if (isAgentStage) {
          return await this.drainQueuedAgents(scratch, ctx);
        }
        return ok(undefined);
      } catch (error) {
        const fail = failure("INTERNAL", `stage ${stage} threw`, {
          details: String(error),
        });
        await this.runInterceptors(stage, "onError", scratch, ctx, fail);
        return err(fail);
      }
    };

    try {
      const timed = await withTimeout(run(), timeoutMs, `stage ${stage}`);
      const durationMs = this.clock.nowMs() - started;
      if (!timed.ok) {
        this.tracer.recordStage({
          stage,
          status: "error",
          durationMs,
          notes: timed.error.message,
        });
        return timed;
      }
      if (!timed.value.ok) {
        this.tracer.recordStage({
          stage,
          status: "error",
          durationMs,
          notes: timed.value.error.message,
        });
        return timed.value;
      }
      this.tracer.recordStage({
        stage,
        status: "ok",
        durationMs,
      });
      return ok(undefined);
    } finally {
      scratch.proposeOpen = false;
      scratch.agentOpen = false;
      scratch.agentQueueOpen = false;
    }
  }

  private async stageBody(
    stage: StageId,
    session: SessionTurnState,
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    switch (stage) {
      case "begin":
        return this.stageBegin(scratch, ctx);
      case "normalize":
        return this.stageNormalize(scratch, ctx);
      case "intent":
        return this.stageIntent(scratch, ctx);
      case "guard":
        return this.stageGuard(scratch, ctx);
      case "plan":
        return this.stagePlan(scratch, ctx);
      case "propose":
        return this.stagePropose(scratch, ctx);
      case "validate_commands":
        return this.stageValidate(session, scratch, ctx);
      case "narrate":
        return this.stageNarrate(scratch, ctx);
      case "present": {
        const presented = await this.stagePresent(scratch, ctx);
        if (!presented.ok) return presented;
        return this.stageMaterialize(session, scratch, ctx);
      }
      case "commit":
        return this.stageCommit(session, scratch);
      case "after":
        return this.stageAfter(scratch, ctx);
      case "end":
        return ok(undefined);
      default:
        return err(failure("INTERNAL", `unknown stage: ${stage}`));
    }
  }

  private async stageBegin(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    for (const owned of this.index.turnSetups) {
      const result = await owned.value.setup({}, this.moduleCtx(owned.moduleId, ctx));
      if (!result.ok) return result;
      if (result.value.extras) {
        Object.assign(scratch.extras, result.value.extras);
      }
    }
    return ok(undefined);
  }

  /**
   * Executes and clears scratch.queuedTasks with tracing + required-task fail policy.
   */
  private async drainQueuedAgents(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const tasks = [...scratch.queuedTasks];
    scratch.queuedTasks = [];
    if (tasks.length === 0 || scratch.kind === "restore") {
      return ok(undefined);
    }

    const results = await this.orchestrator.executeMany(tasks, ctx);
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      const result = results[i]!;
      this.tracer.recordAgent({
        taskId: task.taskId,
        type: task.type,
        requester: `${task.requester.kind}:${task.requester.id}`,
        status: result.ok ? "ok" : "fail",
        input: task.input,
        output: result.ok ? result.data : undefined,
        error: result.ok ? undefined : result.error.message,
      });
      if (result.ok) {
        scratch.extras[`agent.${task.type}.${task.taskId}`] = result.data;
      }
      if (!result.ok && !task.constraints.optional) {
        return err(
          failure("AGENT_FAILED", result.error.message, {
            details: result.error,
            causedBy: [task.requester.id],
          }),
        );
      }
    }
    for (const tool of this.orchestrator.drainToolCalls()) {
      this.tracer.recordTool({
        toolName: tool.toolName,
        callId: tool.callId,
        error: tool.error,
      });
    }
    return ok(undefined);
  }

  private async stageNormalize(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const raw = scratch.rawAction;
    let actionType = "noop";
    let text = raw.text;
    let choiceId = raw.choiceId;
    let targets: string[] = [];
    let confidence: number | undefined;
    let extras: JsonObject = emptyJsonObject();

    if (raw.kind === "choice") {
      if (!raw.choiceId) {
        return err(failure("INVALID_INPUT", "choice action requires choiceId"));
      }
      actionType = "choice";
      choiceId = raw.choiceId;
    } else if (raw.kind === "system") {
      actionType = "system";
    } else if (raw.text && raw.text.trim().length > 0) {
      actionType = "free_text";
      text = raw.text.trim();
    } else if (raw.kind === "free_text" && !raw.text) {
      return err(failure("INVALID_INPUT", "free_text action requires text"));
    }

    for (const owned of this.index.inputNormalizers) {
      const result = await owned.value.normalize(
        raw,
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      const partial = result.value;
      if (partial.actionType) actionType = partial.actionType;
      if (partial.text !== undefined) text = partial.text;
      if (partial.choiceId !== undefined) choiceId = partial.choiceId;
      if (partial.targets) targets = [...partial.targets];
      if (partial.confidence !== undefined) confidence = partial.confidence;
      if (partial.extras) extras = { ...extras, ...partial.extras };
    }

    for (const owned of this.index.actionClassifiers) {
      const result = await owned.value.classify(
        { raw, normalized: undefined },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      const best = [...result.value].sort((a, b) => b.confidence - a.confidence)[0];
      if (best && best.confidence >= 0.5) {
        actionType = best.actionType;
        confidence = best.confidence;
      }
    }

    // Entity resolution for free text refs
    if (text) {
      const resolvedTargets: string[] = [...targets];
      for (const owned of this.index.entityResolvers) {
        const result = await owned.value.resolve(
          {
            text,
            normalized: {
              actionType,
              raw,
              text,
              choiceId,
              targets,
              confidence,
              extras,
            },
          },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!result.ok) return result;
        const candidates = result.value;
        if (candidates.length === 0) continue;
        const top = [...candidates].sort((a, b) => b.confidence - a.confidence);
        const bestScore = top[0]!.confidence;
        const tied = top.filter((c) => c.confidence >= bestScore - 1e-9);
        if (tied.length > 1 && bestScore >= 0.5) {
          const optionsResult = await this.collectDisambiguation(
            `ambiguous entity for "${tied[0]!.ref}"`,
            tied,
            ctx,
          );
          if (!optionsResult.ok) return optionsResult;
          return err(
            failure(
              "AMBIGUOUS_TARGET",
              `ambiguous entity reference: ${tied.map((t) => t.entityId).join(", ")}`,
              { details: { options: optionsResult.value, candidates: tied } },
            ),
          );
        }
        if (top[0] && top[0].confidence >= 0.5) {
          resolvedTargets.push(top[0].entityId);
        }
      }
      targets = [...new Set(resolvedTargets)];
    }

    // Optional action.interpret for free_text
    if (
      this.config.agents.enableActionInterpret &&
      scratch.kind !== "restore" &&
      actionType === "free_text" &&
      text
    ) {
      const knownActionTypes = [...this.index.actionTypes.keys()].sort();
      const task: AgentTask = {
        taskId: createTaskId(),
        type: "action.interpret",
        turnId: scratch.turnId,
        input: {
          text,
          knownActionTypes,
          context: { targets, extras },
        },
        constraints: {
          timeoutMs: this.config.agents.defaultTimeoutMs,
          maxRepairAttempts: this.config.agents.maxRepairAttempts,
          optional: false,
        },
        requester: { kind: "core", id: "turn-pipeline" },
      };
      const interpreted = await ctx.requestAgent(task);
      if (!interpreted.ok) {
        return err(
          failure("AGENT_FAILED", interpreted.error.message, {
            details: interpreted.error,
          }),
        );
      }
      if (typeof interpreted.data.actionType === "string") {
        actionType = interpreted.data.actionType;
      }
      if (typeof interpreted.data.confidence === "number") {
        confidence = interpreted.data.confidence;
      }
      if (Array.isArray(interpreted.data.targets)) {
        targets = interpreted.data.targets.map(String);
      }
      if (
        interpreted.data.extras &&
        typeof interpreted.data.extras === "object" &&
        !Array.isArray(interpreted.data.extras)
      ) {
        extras = {
          ...extras,
          ...(interpreted.data.extras as JsonObject),
        };
      }
    }

    // Validate known action types if catalog non-empty
    if (
      this.index.actionTypes.size > 0 &&
      !this.index.actionTypes.has(actionType) &&
      actionType !== "noop" &&
      actionType !== "system" &&
      actionType !== "choice" &&
      actionType !== "free_text"
    ) {
      return err(
        failure("INVALID_INPUT", `unknown action type: ${actionType}`),
      );
    }

    scratch.normalized = {
      actionType,
      raw,
      text,
      choiceId,
      targets,
      confidence,
      extras,
    };
    this.tracer.recordNormalized(scratch.normalized);
    return ok(undefined);
  }

  private async collectDisambiguation(
    reason: string,
    candidates: unknown[],
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<Choice[], Failure>> {
    const options: Choice[] = [];
    for (const owned of this.index.disambiguationProviders) {
      const result = await owned.value.provide(
        { reason, candidates },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      options.push(...result.value.options);
    }
    return ok(options);
  }

  private async stageIntent(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const action = scratch.normalized!;
    let intent: ActionIntent = {
      intentType: action.actionType,
      verb: action.actionType,
      targets: [...action.targets],
      patches: emptyJsonObject(),
      confidence: action.confidence,
    };

    for (const owned of this.index.intentContributors) {
      const result = await owned.value.contribute(
        { action, intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      intent = {
        ...intent,
        patches: { ...intent.patches, ...result.value.patches },
      };
    }

    // Optional multi-candidate scoring: treat contributor patches as single candidate;
    // scorers may re-rank intentType if multiple registered intent types apply.
    if (this.index.intentScorers.length > 0) {
      const candidates: ActionIntent[] = [intent];
      for (const owned of this.index.intentTypes.values()) {
        if (owned.value.intentType === intent.intentType) continue;
        candidates.push({
          ...intent,
          intentType: owned.value.intentType,
          verb: owned.value.intentType,
        });
      }
      let bestType = intent.intentType;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const owned of this.index.intentScorers) {
        const scored = await owned.value.score(
          { candidates },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!scored.ok) return scored;
        for (const row of scored.value) {
          if (row.score > bestScore) {
            bestScore = row.score;
            bestType = row.intentType;
          }
        }
      }
      if (bestType !== intent.intentType) {
        intent = { ...intent, intentType: bestType, verb: bestType };
      }
    }

    if (
      this.index.intentTypes.size > 0 &&
      !this.index.intentTypes.has(intent.intentType) &&
      intent.intentType !== action.actionType
    ) {
      // soft: keep, warn
      scratch.warnings.push(`intent type not in catalog: ${intent.intentType}`);
    }

    scratch.intent = intent;
    this.tracer.recordIntent(intent);
    return ok(undefined);
  }

  private async stageGuard(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const action = scratch.normalized!;
    const intent = scratch.intent!;

    for (const owned of this.index.prerequisiteCheckers) {
      const result = await owned.value.check(
        { intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      if (result.value.missing.length > 0) {
        return err(
          failure(
            "GUARD_REJECTED",
            `missing prerequisites: ${result.value.missing.join(", ")}`,
            { causedBy: [owned.moduleId] },
          ),
        );
      }
    }

    const mergedCosts: Record<string, number> = {};
    for (const owned of this.index.resourceCostEvaluators) {
      const result = await owned.value.evaluate(
        { intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      for (const [key, value] of Object.entries(result.value.costs)) {
        mergedCosts[key] = (mergedCosts[key] ?? 0) + value;
      }
    }
    // Declared costs only — modules enforce via commands/guards reading this key.
    if (Object.keys(mergedCosts).length > 0) {
      scratch.extras["core.resourceCosts"] = mergedCosts;
      this.tracer.warn(`resource costs declared: ${JSON.stringify(mergedCosts)}`);
    }

    for (const owned of this.index.guards) {
      const result = await owned.value.check(
        { action, intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      if (!result.value.allow) {
        return err(
          failure(
            result.value.code || "GUARD_REJECTED",
            result.value.message || "action rejected by guard",
            { causedBy: [owned.moduleId] },
          ),
        );
      }
    }

    for (const owned of this.index.softGuards) {
      const result = await owned.value.check(
        { action, intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      scratch.warnings.push(...result.value.warnings);
      for (const w of result.value.warnings) this.tracer.warn(w);
    }

    for (const owned of this.index.policyRules) {
      const result = await owned.value.evaluate(
        { intent, draftCommands: scratch.proposedCommands },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      if (result.value.decision === "deny") {
        return err(
          failure(
            "GUARD_REJECTED",
            result.value.reason || "policy denied action",
            { causedBy: [owned.moduleId] },
          ),
        );
      }
    }

    return ok(undefined);
  }

  private async stagePlan(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    if (scratch.kind === "restore") {
      return ok(undefined);
    }

    const intent = scratch.intent!;

    for (const owned of this.index.salienceProviders) {
      const result = await owned.value.provide(
        { intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      scratch.extras[`salience.${owned.moduleId}`] = result.value;
    }

    for (const owned of this.index.planners) {
      const result = await owned.value.plan(
        { intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      scratch.planArtifacts = {
        ...scratch.planArtifacts,
        [owned.moduleId]: result.value.artifacts,
      };
      for (const task of result.value.suggestedTasks) {
        scratch.queuedTasks.push(stampTaskRequester(task, owned.moduleId));
      }
    }

    for (const owned of this.index.agentTaskContributors) {
      const result = await owned.value.contribute(
        { stage: "plan", intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      for (const task of result.value.tasks) {
        scratch.queuedTasks.push(stampTaskRequester(task, owned.moduleId));
      }
    }

    // Includes before:plan interceptor tasks + planner/contributor tasks.
    return this.drainQueuedAgents(scratch, ctx);
  }

  private async stagePropose(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const intent = scratch.intent!;

    if (scratch.kind === "player" || scratch.kind === "system") {
      scratch.proposedCommands.push({
        commandId: createCommandId(),
        type: CORE_COMMAND_TYPES.bumpTurn,
        slice: "core",
        payload: { turnId: scratch.turnId },
        reason: "core turn advance",
        source: { kind: "core", id: "turn-pipeline" },
      });
    }

    for (const owned of this.index.transitionContributors) {
      const result = await owned.value.contribute(
        { intent, planArtifacts: scratch.planArtifacts },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      const stamped = result.value.commands.map((command) =>
        command.source
          ? command
          : {
              ...command,
              source: { kind: "module" as const, id: owned.moduleId },
            },
      );
      const checked = this.checkCommandPermissions(stamped);
      if (!checked.ok) return checked;
      scratch.proposedCommands.push(...stamped);
    }

    for (const owned of this.index.commandDecorators) {
      const result = await owned.value.decorate(
        { commands: scratch.proposedCommands },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      scratch.proposedCommands = result.value.commands;
    }

    const finalCheck = this.checkCommandPermissions(scratch.proposedCommands);
    if (!finalCheck.ok) return finalCheck;

    return ok(undefined);
  }

  private checkCommandPermissions(
    commands: readonly StateCommand[],
  ): Result<void, Failure> {
    for (const command of commands) {
      if (command.source.kind !== "module") continue;
      const granted = this.getModulePermissions(command.source.id);
      const needed = proposePermissionForSlice(command.slice);
      if (!hasPermission(granted, needed)) {
        return err(
          failure(
            "PERMISSION_DENIED",
            `module ${command.source.id} cannot propose to slice "${command.slice}" (needs ${needed})`,
            { causedBy: [command.source.id], details: { commandId: command.commandId } },
          ),
        );
      }
    }
    return ok(undefined);
  }

  private async stageValidate(
    session: SessionTurnState,
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const resolved = await this.resolveConflicts(
      scratch.proposedCommands,
      session.kernel.getDraftView() as WorldState,
      ctx,
    );
    if (!resolved.ok) return resolved;
    scratch.proposedCommands = resolved.value;

    for (const command of scratch.proposedCommands) {
      for (const owned of this.index.commandValidators) {
        const draft = session.kernel.getDraftView() as WorldState;
        const result = await owned.value.validate(
          { command, draft },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!result.ok) return result;
        if (!result.value.ok) {
          return err(
            failure("COMMAND_INVALID", result.value.reason, {
              causedBy: [owned.moduleId],
            }),
          );
        }
      }
    }

    const applied = session.kernel.dryApply(scratch.proposedCommands);
    if (!applied.ok) {
      this.tracer.recordCommands(
        scratch.proposedCommands.map((command) => ({
          command,
          accepted: false,
          reason: applied.error.message,
        })),
      );
      return applied;
    }

    scratch.acceptedCommands = [...applied.value.acceptedCommands];
    this.tracer.recordCommands(
      applied.value.records.map((record) => ({
        command: record.command,
        accepted: record.accepted,
        reason: record.reason,
      })),
    );

    const draft = applied.value.draft;
    for (const owned of this.index.invariantPorts) {
      const result = await owned.value.check(
        { draft },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      if (!result.value.ok) {
        return err(
          failure("INVARIANT_FAILED", result.value.reason, {
            causedBy: [owned.moduleId],
          }),
        );
      }
    }

    for (const owned of this.index.draftSimulators) {
      const sim = await owned.value.simulate(
        { draft, commands: scratch.acceptedCommands },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!sim.ok) return sim;
      scratch.extras[`draftSim.${owned.moduleId}`] = sim.value.preview;
    }

    this.tracer.recordStateDiff(diffWorldState(scratch.s0, draft));
    return ok(undefined);
  }

  private async resolveConflicts(
    commands: readonly StateCommand[],
    draft: WorldState,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<StateCommand[], Failure>> {
    if (this.index.conflictKeys.length === 0) {
      return ok([...commands]);
    }

    let working = [...commands];
    for (const keyOwned of this.index.conflictKeys) {
      const key = keyOwned.value;
      const matching = working.filter((command) =>
        commandTouchesConflictKey(command, key),
      );
      if (matching.length <= 1) continue;

      // Prefer resolver whose module owns the conflict key, else first registered.
      const preferred =
        this.index.conflictResolvers.find(
          (item) => item.moduleId === keyOwned.moduleId,
        ) ?? this.index.conflictResolvers[0];

      if (!preferred) {
        return err(
          failure(
            "COMMAND_CONFLICT",
            `conflicting writes for ${key.slice}:${key.path} without ConflictResolver`,
            {
              details: {
                conflictKey: key.id,
                commandIds: matching.map((c) => c.commandId),
              },
            },
          ),
        );
      }

      const resolved = await preferred.value.resolve(
        { key: key.id, commands: matching, draft },
        this.moduleCtx(preferred.moduleId, ctx),
      );
      if (!resolved.ok) return resolved;

      const matchIds = new Set(matching.map((c) => c.commandId));
      working = [
        ...working.filter((c) => !matchIds.has(c.commandId)),
        ...resolved.value.commands,
      ];
    }
    return ok(working);
  }

  private async stageNarrate(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    if (scratch.kind === "restore") {
      scratch.narrativeProse =
        scratch.narrativeProse ??
        "(restore) session views rebuilt without narrative.";
      scratch.narrativeBrief = { restore: true };
      this.tracer.recordNarrative(scratch.narrativeBrief, scratch.narrativeProse);
      return ok(undefined);
    }

    const intent = scratch.intent!;

    // Narrate-stage agent contributions (NPC voice, etc.) before narrative.write.
    for (const owned of this.index.agentTaskContributors) {
      const result = await owned.value.contribute(
        { stage: "narrate", intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      for (const task of result.value.tasks) {
        scratch.queuedTasks.push(stampTaskRequester(task, owned.moduleId));
      }
    }
    const narrateAgents = await this.drainQueuedAgents(scratch, ctx);
    if (!narrateAgents.ok) return narrateAgents;

    const draft = ctx.stateView;
    const namespaces: Record<string, JsonObject> = {};
    const denyMention = new Set<string>();
    const allowMention = new Set<string>();

    for (const owned of this.index.briefPolicies) {
      const result = await owned.value.contribute(
        {},
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      for (const item of result.value.denyMention) denyMention.add(item);
      for (const item of result.value.allowMention ?? []) allowMention.add(item);
    }

    const promptFragments: { id: string; text: string; priority: number }[] = [];
    for (const owned of this.index.promptFragmentProviders) {
      for (const slot of ["system", "narrate", "style"]) {
        const result = await owned.value.provide(
          { slot },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!result.ok) return result;
        for (const frag of result.value.fragments) {
          promptFragments.push({
            id: `${slot}:${frag.id}`,
            text: frag.text,
            priority: frag.priority ?? owned.priority,
          });
        }
      }
    }
    promptFragments.sort(
      (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
    );

    const localeStrings: Record<string, string> = {};
    for (const owned of this.index.localizationContributors) {
      const result = await owned.value.provide(
        { locale: this.config.turn.locale },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      Object.assign(localeStrings, result.value.strings);
    }

    const resourceCosts =
      (scratch.extras["core.resourceCosts"] as Record<string, number> | undefined) ??
      undefined;

    const brief: JsonObject = {
      intent: intent as unknown as JsonObject,
      turnId: scratch.turnId,
      core: {
        turnIndex: draft.core.turnIndex,
        flags: draft.core.flags as unknown as JsonObject,
      },
      namespaces,
      policy: {
        denyMention: [...denyMention].sort(),
        allowMention: [...allowMention].sort(),
      },
      promptFragments: promptFragments.map((f) => ({ id: f.id, text: f.text })),
      ...(Object.keys(localeStrings).length > 0 ? { localeStrings } : {}),
      ...(resourceCosts ? { resourceCosts } : {}),
    };

    for (const owned of this.index.narrativeContextProviders) {
      const result = await owned.value.provide(
        { draft, intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      namespaces[result.value.namespace] = result.value.data;
    }

    const history = extractNarrativeHistory(namespaces);
    stripHistoryFromWorkingMemoryNamespace(namespaces);

    const style: JsonObject = {};
    for (const owned of this.index.narrativeStyleProviders) {
      const result = await owned.value.provide(
        {},
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      Object.assign(style, result.value);
    }

    const task: AgentTask = {
      taskId: createTaskId(),
      type: "narrative.write",
      turnId: scratch.turnId,
      input: {
        brief,
        style,
        locale: this.config.turn.locale,
        ...(history.length > 0 ? { history } : {}),
      },
      constraints: {
        timeoutMs: this.config.agents.defaultTimeoutMs,
        maxRepairAttempts: this.config.agents.maxRepairAttempts,
        optional: false,
      },
      requester: { kind: "core", id: "turn-pipeline" },
    };

    const result = await ctx.requestAgent(task);
    if (!result.ok) {
      return err(
        failure("AGENT_FAILED", result.error.message, {
          details: result.error,
        }),
      );
    }

    const prose = String(result.data.prose ?? "");
    if (!prose) {
      return err(failure("AGENT_FAILED", "narrative.write returned empty prose"));
    }

    for (const owned of this.index.narrativeCritics) {
      const critique = await owned.value.critique(
        { prose, brief, draft },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!critique.ok) return critique;
      if (!critique.value.ok) {
        return err(
          failure("AGENT_FAILED", critique.value.reason, {
            causedBy: [owned.moduleId],
          }),
        );
      }
    }

    scratch.narrativeBrief = brief;
    scratch.narrativeProse = prose;
    const drafts = result.data.choiceDrafts;
    if (Array.isArray(drafts)) {
      scratch.choiceDrafts.push(...(drafts as Choice[]));
    }
    this.tracer.recordNarrative(brief, prose);
    return ok(undefined);
  }

  private async stagePresent(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const intent = scratch.intent!;
    const draft = ctx.stateView;
    let prose = scratch.narrativeProse ?? "";

    for (const owned of this.index.passageAssemblers) {
      const result = await owned.value.assemble(
        { prose, draft },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      const sections = [...result.value.sections].sort(
        (a, b) => a.priority - b.priority || a.slot.localeCompare(b.slot),
      );
      if (sections.length > 0) {
        prose = sections.map((s) => s.body).join("\n\n");
      }
    }

    let choices: Choice[] = [...scratch.choiceDrafts];
    for (const owned of this.index.choiceContributors) {
      const result = await owned.value.contribute(
        { draft, intent },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      for (const choice of result.value.choices) {
        if (
          this.index.choiceKinds.size > 0 &&
          !this.index.choiceKinds.has(choice.kind)
        ) {
          scratch.warnings.push(`choice kind not in catalog: ${choice.kind}`);
        }
        choices.push(choice);
      }
    }

    for (const owned of this.index.choiceFilters) {
      const result = await owned.value.filter(
        { choices, draft },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      choices = result.value.choices;
    }

    const seen = new Set<string>();
    choices = choices.filter((choice) => {
      if (seen.has(choice.id)) return false;
      seen.add(choice.id);
      return true;
    });

    if (!prose) {
      return err(failure("PRESENT_FAILED", "passage prose is empty"));
    }

    const visibleState: Record<string, JsonObject> = {};
    for (const owned of this.index.publicProjectors) {
      visibleState[owned.value.id] = owned.value.project(draft);
    }

    const statusLines: { slot: string; text: string }[] = [];
    for (const owned of this.index.statusPanelProviders) {
      const result = await owned.value.provide(
        { draft },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      statusLines.push(...result.value.lines);
    }
    if (statusLines.length > 0) {
      visibleState["statusPanel"] = {
        lines: statusLines
          .slice()
          .sort((a, b) => a.slot.localeCompare(b.slot))
          .map((line) => ({ slot: line.slot, text: line.text })),
      };
    }

    scratch.passage = {
      id: createPassageId(),
      turnId: scratch.turnId,
      prose,
      choices,
      visibleState:
        Object.keys(visibleState).length > 0 ? visibleState : undefined,
    };
    this.tracer.recordPassage(scratch.passage);
    return ok(undefined);
  }

  /**
   * Pre-commit materialize window: modules may emit StateCommands now that
   * passage prose is known (e.g. working-memory pairs). Progressive dry-apply.
   */
  private async stageMaterialize(
    session: SessionTurnState,
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    const passage = scratch.passage;
    const intent = scratch.intent;
    if (!passage || !intent) {
      return ok(undefined);
    }
    if (this.index.postNarrativeContributors.length === 0) {
      return ok(undefined);
    }

    const draft = ctx.stateView;
    const extraCommands: StateCommand[] = [];

    scratch.proposeOpen = true;
    try {
      for (const owned of this.index.postNarrativeContributors) {
        const result = await owned.value.contribute(
          {
            passage,
            intent,
            draft,
            rawAction: scratch.rawAction,
            turnKind: scratch.kind,
          },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!result.ok) return result;
        const stamped = result.value.commands.map((command) =>
          command.source
            ? command
            : {
                ...command,
                source: { kind: "module" as const, id: owned.moduleId },
              },
        );
        const checked = this.checkCommandPermissions(stamped);
        if (!checked.ok) return checked;
        extraCommands.push(...stamped);
      }
    } finally {
      scratch.proposeOpen = false;
    }

    if (extraCommands.length === 0) {
      return ok(undefined);
    }

    for (const command of extraCommands) {
      for (const owned of this.index.commandValidators) {
        const currentDraft = session.kernel.getDraftView() as WorldState;
        const result = await owned.value.validate(
          { command, draft: currentDraft },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!result.ok) return result;
        if (!result.value.ok) {
          return err(
            failure("COMMAND_INVALID", result.value.reason, {
              causedBy: [owned.moduleId],
            }),
          );
        }
      }
    }

    const applied = session.kernel.dryApply(extraCommands);
    if (!applied.ok) {
      this.tracer.recordCommands(
        extraCommands.map((command) => ({
          command,
          accepted: false,
          reason: applied.error.message,
        })),
      );
      return applied;
    }

    scratch.acceptedCommands.push(...applied.value.acceptedCommands);
    this.tracer.recordCommands(
      applied.value.records.map((record) => ({
        command: record.command,
        accepted: record.accepted,
        reason: record.reason,
      })),
    );

    const nextDraft = applied.value.draft;
    for (const owned of this.index.invariantPorts) {
      const result = await owned.value.check(
        { draft: nextDraft },
        this.moduleCtx(owned.moduleId, ctx),
      );
      if (!result.ok) return result;
      if (!result.value.ok) {
        return err(
          failure("INVARIANT_FAILED", result.value.reason, {
            causedBy: [owned.moduleId],
          }),
        );
      }
    }

    this.tracer.recordStateDiff(diffWorldState(scratch.s0, nextDraft));
    this.tracer.note({
      namespace: "core",
      title: "Materialize",
      body: `Post-narrative commands applied: ${applied.value.acceptedCommands.length}`,
    });
    return ok(undefined);
  }

  private async stageCommit(
    session: SessionTurnState,
    scratch: TurnScratch,
  ): Promise<Result<void, Failure>> {
    const passage = scratch.passage;
    if (!passage) {
      return err(failure("PRESENT_FAILED", "missing passage at commit"));
    }

    const draft = session.kernel.getDraftView() as WorldState;
    const prevRevision = scratch.s0.meta.revision;
    const nextRevision = draft.meta.revision;
    const timestamp = this.clock.nowIso();

    const journalEntry: JournalEntry = {
      turnId: scratch.turnId,
      prevRevision,
      nextRevision,
      input: scratch.rawAction,
      commands: scratch.acceptedCommands,
      passageId: passage.id,
      timestamp,
    };

    const snapshot = {
      formatVersion: 1,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      updatedAt: timestamp,
      engine: {
        coreVersion: this.coreVersion,
        contractsVersion: this.contractsVersion,
      },
      enabledModules: [...session.enabledModules],
      state: deepClone(draft),
      lastPassageId: passage.id,
      passages: [
        ...[...session.passages.values()].map((p) => deepClone(p)),
        deepClone(passage),
      ],
      idempotency: Object.fromEntries(
        [...session.idempotency.entries()].map(([k, v]) => [k, v.turnId]),
      ),
      meta: {
        ...(session.meta ?? {}),
        ...(session.seed ? { seed: session.seed } : {}),
      },
    };

    if (this.config.persistence.policy === "per_turn") {
      if (typeof this.persistence.commitTurn === "function") {
        const unit = await this.persistence.commitTurn({
          snapshot,
          journalEntries: [journalEntry],
        });
        if (!unit.ok) {
          this.tracer.recordPersistence(
            `commitTurn failed: ${unit.error.message}`,
          );
          return err(
            failure("PERSISTENCE_FAILED", unit.error.message, {
              details: unit.error.details,
            }),
          );
        }
        this.tracer.recordPersistence("commitTurn TX ok");
      } else {
        const saved = await this.persistence.save(snapshot);
        if (!saved.ok) {
          this.tracer.recordPersistence(`save failed: ${saved.error.message}`);
          return err(
            failure("PERSISTENCE_FAILED", saved.error.message, {
              details: saved.error.details,
            }),
          );
        }
        const appended = await this.persistence.appendJournal(
          session.sessionId,
          [journalEntry],
        );
        if (!appended.ok) {
          this.tracer.recordPersistence(
            `appendJournal failed: ${appended.error.message}`,
          );
          return err(
            failure("PERSISTENCE_FAILED", appended.error.message, {
              details: appended.error.details,
            }),
          );
        }
        this.tracer.recordPersistence("save+journal ok (no commitTurn)");
      }
    } else {
      this.tracer.recordPersistence("manual policy — skipped auto flush");
    }

    const committed = session.kernel.commit();
    if (!committed.ok) {
      return committed;
    }

    session.lastPassage = passage;
    session.passages.set(passage.id, passage);

    this.events.publish({
      type: "state.committed",
      sessionId: session.sessionId,
      revision: nextRevision,
      at: timestamp,
    });
    this.events.publish({
      type: "passage.published",
      sessionId: session.sessionId,
      passage,
      at: timestamp,
    });
    this.events.publish({
      type: "turn.committed",
      sessionId: session.sessionId,
      turnId: scratch.turnId,
      revision: nextRevision,
      passageId: passage.id,
      at: timestamp,
    });

    return ok(undefined);
  }

  private async stageAfter(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<Result<void, Failure>> {
    if (!scratch.passage) return ok(undefined);
    for (const owned of this.index.afterCommitHooks) {
      try {
        const result = await owned.value.afterCommit(
          {
            passage: scratch.passage,
            acceptedCommands: scratch.acceptedCommands,
          },
          this.moduleCtx(owned.moduleId, ctx),
        );
        if (!result.ok) {
          this.log.warn(
            { moduleId: owned.moduleId, err: result.error },
            "AfterCommitHook failed (ignored)",
          );
          this.tracer.warn(
            `AfterCommitHook ${owned.moduleId}: ${result.error.message}`,
          );
        }
      } catch (error) {
        this.log.warn(
          { moduleId: owned.moduleId, err: String(error) },
          "AfterCommitHook threw (ignored)",
        );
      }
    }

    // Only player turns may schedule follow-up system turns (prevents drain loops).
    if (scratch.kind === "player") {
      for (const owned of this.index.systemTurnSchedulers) {
        try {
          const scheduled = await owned.value.schedule(
            {},
            this.moduleCtx(owned.moduleId, ctx),
          );
          if (scheduled.ok) {
            for (const request of scheduled.value.requests) {
              scratch.scheduledSystemTurns.push({
                reason: request.reason,
                payload: request.payload,
                requestedByModuleId: owned.moduleId,
              });
            }
          }
        } catch {
          /* observe/schedule only */
        }
      }
    }

    return ok(undefined);
  }

  private async runOnRejected(
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
  ): Promise<void> {
    if (!scratch.failure) return;
    for (const owned of this.index.onTurnRejected) {
      try {
        await owned.value.onRejected(
          { failure: scratch.failure },
          this.moduleCtx(owned.moduleId, ctx),
        );
      } catch {
        /* observe */
      }
    }
  }

  private async runInterceptors(
    stage: StageId,
    when: "before" | "after" | "onError",
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
    error?: Failure,
  ): Promise<Result<void, Failure>> {
    const ran = await this.runInterceptorList(stage, when, scratch, ctx, error);
    if (!ran.ok) return ran;
    if (stage === "begin" && when === "before") {
      return this.runInterceptorList("turn.begin", when, scratch, ctx, error);
    }
    return ok(undefined);
  }

  private async runNamedInterceptors(
    stage: string,
    when: "before" | "after" | "onError",
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
    error?: Failure,
  ): Promise<Result<void, Failure>> {
    return this.runInterceptorList(stage, when, scratch, ctx, error);
  }

  private async runInterceptorList(
    stage: string,
    when: "before" | "after" | "onError",
    scratch: TurnScratch,
    ctx: ReturnType<typeof createTurnContext>,
    error?: Failure,
  ): Promise<Result<void, Failure>> {
    const list = this.index.getInterceptors(stage, when);
    for (const owned of list) {
      if (owned.value.permission) {
        const token = owned.value.permission as PermissionToken;
        if (!hasPermission(this.getModulePermissions(owned.moduleId), token)) {
          return err(
            failure(
              "PERMISSION_DENIED",
              `module ${owned.moduleId} lacks interceptor permission ${owned.value.permission}`,
              { causedBy: [owned.moduleId] },
            ),
          );
        }
      }
      const mctx = this.moduleCtx(owned.moduleId, ctx);
      const result = await owned.value.handle(mctx, error);
      if (!result.ok) return result;
      const effects = normalizeEffects(result.value);
      for (const effect of effects) {
        const applied = this.applyInterceptorEffect(
          effect,
          scratch,
          owned.moduleId,
        );
        if (!applied.ok) return applied;
      }
    }
    return ok(undefined);
  }

  private applyInterceptorEffect(
    effect: InterceptorEffect,
    scratch: TurnScratch,
    moduleId: string,
  ): Result<void, Failure> {
    switch (effect.type) {
      case "reject":
        return err(effect.failure);
      case "warn":
        scratch.warnings.push(effect.message);
        return ok(undefined);
      case "patchExtras":
        scratch.extras[effect.namespace] = {
          ...((scratch.extras[effect.namespace] as JsonObject) ?? {}),
          ...effect.data,
        };
        return ok(undefined);
      case "enqueueAgentTask": {
        if (!scratch.agentQueueOpen) {
          return err(
            failure(
              "INTERNAL",
              `enqueueAgentTask from module ${moduleId} is only allowed on plan/propose/narrate stages`,
              { causedBy: [moduleId] },
            ),
          );
        }
        scratch.queuedTasks.push(stampTaskRequester(effect.task, moduleId));
        return ok(undefined);
      }
      case "enqueueCommands": {
        if (!scratch.proposeOpen) {
          return err(
            failure(
              "INTERNAL",
              `enqueueCommands from module ${moduleId} is only allowed during propose/validate window`,
              { causedBy: [moduleId] },
            ),
          );
        }
        const stamped = effect.commands.map((command) =>
          command.source
            ? command
            : {
                ...command,
                source: { kind: "module" as const, id: moduleId },
              },
        );
        const checked = this.checkCommandPermissions(stamped);
        if (!checked.ok) return checked;
        scratch.proposedCommands.push(...stamped);
        return ok(undefined);
      }
      default:
        return ok(undefined);
    }
  }

  private async finishCommitted(
    session: SessionTurnState,
    scratch: TurnScratch,
  ): Promise<TurnResult> {
    for (const owned of this.index.turnTeardowns) {
      try {
        await owned.value.teardown(
          {},
          createTurnContext({
            turnId: scratch.turnId,
            sessionId: scratch.sessionId,
            getStateView: () => session.kernel.getAuthoritative() as WorldState,
            propose: () =>
              err(failure("INTERNAL", "propose closed after commit")),
            requestAgent: async (task) => ({
              ok: false,
              taskId: task.taskId,
              error: { code: "CLOSED", message: "turn closed" },
            }),
            note: (n) => this.tracer.note(n),
            extras: scratch.extras,
            log: this.log,
            permissions: createCorePermissionChecker(),
          }),
        );
      } catch {
        /* ignore */
      }
    }

    const auth = session.kernel.getAuthoritative() as WorldState;
    await this.tracer.finalize({
      outcome: "committed",
      stateRevisionAfter: auth.meta.revision,
      turnIndex: auth.core.turnIndex,
    });

    return {
      status: "committed",
      turnId: scratch.turnId,
      sessionId: scratch.sessionId,
      revision: auth.meta.revision,
      passage: scratch.passage!,
      acceptedCommands: scratch.acceptedCommands,
      warnings: scratch.warnings,
    };
  }

  private async finishRejected(
    session: SessionTurnState,
    scratch: TurnScratch,
  ): Promise<TurnResult> {
    session.kernel.discard();
    const failurePayload =
      scratch.failure ??
      ({
        turnId: scratch.turnId,
        code: "INTERNAL",
        message: "turn rejected",
      } satisfies TurnFailure);

    this.events.publish({
      type: "turn.rejected",
      sessionId: scratch.sessionId,
      turnId: scratch.turnId,
      failure: failurePayload,
      at: this.clock.nowIso(),
    });

    const auth = session.kernel.getAuthoritative() as WorldState;
    this.tracer.recordStateDiff([]);
    await this.tracer.finalize({
      outcome: "rejected",
      failure: failurePayload,
      stateRevisionAfter: auth.meta.revision,
      turnIndex: auth.core.turnIndex,
    });

    return {
      status: "rejected",
      turnId: scratch.turnId,
      sessionId: scratch.sessionId,
      failure: failurePayload,
      warnings: scratch.warnings,
    };
  }
}

function toTurnFailure(
  turnId: string,
  error: Failure,
  stage: string,
): TurnFailure {
  const code = isTurnFailureCode(error.code)
    ? error.code
    : mapFailureCode(error.code);
  return {
    turnId,
    code,
    message: error.message,
    details: error.details,
    causedBy: error.causedBy ? [...error.causedBy] : undefined,
    stage,
  };
}

function isTurnFailureCode(code: string): code is TurnFailure["code"] {
  return (
    code === "GUARD_REJECTED" ||
    code === "INVALID_INPUT" ||
    code === "COMMAND_INVALID" ||
    code === "COMMAND_CONFLICT" ||
    code === "AGENT_FAILED" ||
    code === "TIMEOUT" ||
    code === "INTERNAL" ||
    code === "PERMISSION_DENIED" ||
    code === "INVARIANT_FAILED" ||
    code === "PRESENT_FAILED" ||
    code === "PERSISTENCE_FAILED" ||
    code === "AMBIGUOUS_TARGET" ||
    code === "MODULE_ERROR"
  );
}

function mapFailureCode(code: string): TurnFailure["code"] {
  if (
    code === "SCHEMA_INVALID" ||
    code === "NO_HANDLER" ||
    code === "NO_ADAPTER"
  ) {
    return "AGENT_FAILED";
  }
  return "INTERNAL";
}

function normalizeEffects(
  value: void | InterceptorEffect | InterceptorEffect[],
): InterceptorEffect[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && "type" in value) return [value];
  return [];
}

function stampTaskRequester(task: AgentTask, moduleId: string): AgentTask {
  if (task.requester?.kind === "module" && task.requester.id) {
    return task;
  }
  return {
    ...task,
    requester: { kind: "module", id: moduleId },
  };
}

/**
 * Lifts `namespaces.working_memory.history` into narrative.write chat history.
 */
function extractNarrativeHistory(
  namespaces: Record<string, JsonObject>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const wm = namespaces.working_memory;
  if (!wm || typeof wm !== "object") return [];
  const raw = (wm as JsonObject).history;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.length > 0
    ) {
      out.push({ role, content });
    }
  }
  return out;
}

/**
 * Removes history from brief namespace so transcript is not double-sent in JSON.
 */
function stripHistoryFromWorkingMemoryNamespace(
  namespaces: Record<string, JsonObject>,
): void {
  const wm = namespaces.working_memory;
  if (!wm || typeof wm !== "object") return;
  if (!("history" in wm)) return;
  const next: Record<string, JsonObject[string]> = { ...wm };
  delete next.history;
  namespaces.working_memory = next;
}

