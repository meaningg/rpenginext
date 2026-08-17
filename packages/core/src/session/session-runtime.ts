import {
  CONTRACTS_VERSION,
  SESSION_FORMAT_VERSION,
  createEmptyWorldState,
  err,
  failure,
  ok,
  type Engine,
  type Failure,
  type JournalEntry,
  type JsonObject,
  type Module,
  type ModuleFactory,
  type NewSessionSpec,
  type Passage,
  type PersistencePort,
  type PlayerAction,
  type Result,
  type SavePointer,
  type Session,
  type TurnLogger,
  type TurnResult,
  type WorldState,
  type StateCommand,
} from "@rpengineext/contracts";

import type { AgentOrchestrator } from "../agents/agent-orchestrator.ts";
import type { EngineConfig } from "../config/types.ts";
import type { EventBus } from "../events/event-bus.ts";
import { HostSurface } from "../host/host-surface.ts";
import {
  TurnPipeline,
  type PendingSystemTurn,
  type SessionTurnState,
} from "../pipeline/turn-pipeline.ts";
import type { ContributionIndex } from "../registry/contribution-index.ts";
import type { ModuleRegistry } from "../registry/module-registry.ts";
import { createCoreCommandDefinitions } from "../state/core-commands.ts";
import { replayJournal } from "../state/journal-replay.ts";
import { applySliceMigrations } from "../state/slice-migrations.ts";
import { StateKernel } from "../state/state-kernel.ts";
import type { TurnTracer } from "../tracing/turn-tracer.ts";
import type { Clock } from "../util/clock.ts";
import { createSessionId, createTurnId } from "../util/ids.ts";
import { CORE_VERSION } from "../version.ts";
import {
  createTurnContext,
  createCorePermissionChecker,
} from "../pipeline/turn-context.ts";

export interface SessionRuntimeOptions {
  readonly log: TurnLogger;
  readonly clock: Clock;
  readonly config: EngineConfig;
  readonly registry: ModuleRegistry;
  readonly orchestrator: AgentOrchestrator;
  readonly tracer: TurnTracer;
  readonly persistence: PersistencePort;
  readonly events: EventBus;
}

/**
 * Host-facing session coordinator implementing Engine/Session contracts.
 */
export class SessionRuntime implements Engine {
  private readonly log: TurnLogger;
  private readonly clock: Clock;
  private readonly config: EngineConfig;
  private readonly registry: ModuleRegistry;
  private readonly orchestrator: AgentOrchestrator;
  private readonly tracer: TurnTracer;
  private readonly persistence: PersistencePort;
  private readonly events: EventBus;
  private readonly pipeline: TurnPipeline;
  private readonly sessions = new Map<
    string,
    SessionTurnState & { busy: boolean }
  >();
  private readonly index: ContributionIndex;
  private readonly hostSurface: HostSurface;

  /**
   * @param options - runtime dependencies (registry already booted+started)
   */
  constructor(options: SessionRuntimeOptions) {
    this.log = options.log.child({ component: "session-runtime" });
    this.clock = options.clock;
    this.config = options.config;
    this.registry = options.registry;
    this.orchestrator = options.orchestrator;
    this.tracer = options.tracer;
    this.persistence = options.persistence;
    this.events = options.events;
    this.index = options.registry.getIndex();
    this.hostSurface = new HostSurface(this.index);
    this.pipeline = new TurnPipeline({
      log: this.log,
      clock: this.clock,
      config: this.config,
      index: this.index,
      orchestrator: this.orchestrator,
      tracer: this.tracer,
      persistence: this.persistence,
      events: this.events,
      coreVersion: CORE_VERSION,
      contractsVersion: CONTRACTS_VERSION,
      getModulePermissions: (moduleId) =>
        this.registry.getModulePermissions(moduleId),
    });
  }

  /**
   * Host-facing contribution helpers (CLI/help/debug).
   */
  getHostSurface(): HostSurface {
    return this.hostSurface;
  }

  /**
   * @inheritdoc
   */
  async startSession(
    spec: NewSessionSpec = {},
  ): Promise<Result<Session, Failure>> {
    const sessionId = spec.sessionId ?? createSessionId();
    if (this.sessions.has(sessionId)) {
      return err(failure("INTERNAL", `session already exists: ${sessionId}`));
    }

    const createdAt = this.clock.nowIso();
    const initial = createEmptyWorldState(createdAt);
    const kernel = new StateKernel(initial);
    const prepared = this.prepareKernel(kernel);
    if (!prepared.ok) return prepared;

    // Apply slice initial values
    let state = kernel.getAuthoritative() as WorldState;
    const slices: Record<string, JsonObject> = {
      ...state.slices,
    };
    for (const [name, owned] of this.index.slices) {
      slices[name] = owned.value.initialValue
        ? { ...owned.value.initialValue }
        : {};
    }
    state = { ...state, slices };
    kernel.replaceAuthoritative(state);

    const enabledModules = this.registry.getModules().map((m) => ({
      id: m.module.manifest.id,
      version: m.module.manifest.version,
    }));

    const sessionState: SessionTurnState & { busy: boolean } = {
      sessionId,
      kernel,
      lastPassage: null,
      passages: new Map(),
      enabledModules,
      seed: spec.seed,
      createdAt,
      idempotency: new Map(),
      pendingSystemTurns: [],
      meta: spec.meta ? { ...spec.meta } : {},
      busy: false,
    };

    const bootCommands: StateCommand[] = [];
    const bootCtx = createTurnContext({
      turnId: createTurnId(),
      sessionId,
      getStateView: () => sessionState.kernel.getAuthoritative() as WorldState,
      propose: (commands) => {
        bootCommands.push(...commands);
        return ok(undefined);
      },
      requestAgent: async (task) => ({
        ok: false,
        taskId: task.taskId,
        error: { code: "BOOT", message: "agents unavailable during bootstrap" },
      }),
      note: () => undefined,
      extras: {},
      log: this.log.child({ sessionId }),
      permissions: createCorePermissionChecker(),
    });

    for (const owned of this.index.sessionBootstraps) {
      const result = await owned.value.bootstrap({ isNewGame: true }, bootCtx);
      if (!result.ok) return result;
      bootCommands.push(...result.value.commands);
    }

    if (bootCommands.length > 0) {
      const begin = kernel.beginTurn(`boot_${sessionId}`);
      if (!begin.ok) return begin;
      const applied = kernel.dryApply(bootCommands);
      if (!applied.ok) {
        kernel.discard();
        return applied;
      }
      const committed = kernel.commit();
      if (!committed.ok) return committed;
    }

    const snapshotSave = await this.persistence.save({
      formatVersion: SESSION_FORMAT_VERSION,
      sessionId,
      createdAt,
      updatedAt: createdAt,
      engine: {
        coreVersion: CORE_VERSION,
        contractsVersion: CONTRACTS_VERSION,
      },
      enabledModules,
      state: kernel.getAuthoritative() as WorldState,
      meta: {
        ...(spec.meta ?? {}),
        ...(spec.seed ? { seed: spec.seed } : {}),
      },
    });
    if (!snapshotSave.ok) {
      return snapshotSave;
    }

    this.sessions.set(sessionId, sessionState);
    this.log.info({ sessionId }, "session started");
    return ok(this.asSessionHandle(sessionId));
  }

  /**
   * @inheritdoc
   */
  async loadSession(sessionId: string): Promise<Result<Session, Failure>> {
    const loaded = await this.persistence.load(sessionId);
    if (!loaded.ok) return loaded;
    if (!loaded.value) {
      return err(failure("INTERNAL", `session not found: ${sessionId}`));
    }

    const snapshot = loaded.value;
    let state = snapshot.state;

    const migrated = applySliceMigrations(
      state,
      this.index.slices,
      this.index.migrations,
    );
    if (!migrated.ok) return migrated;
    state = migrated.value;

    const kernel = new StateKernel(state);
    const prepared = this.prepareKernel(kernel);
    if (!prepared.ok) return prepared;

    const passages = new Map<string, Passage>();
    for (const passage of snapshot.passages ?? []) {
      passages.set(passage.id, passage);
    }

    const seed =
      typeof snapshot.meta?.seed === "string" ? snapshot.meta.seed : undefined;

    const sessionState: SessionTurnState & { busy: boolean } = {
      sessionId,
      kernel,
      lastPassage: snapshot.lastPassageId
        ? (passages.get(snapshot.lastPassageId) ?? null)
        : null,
      passages,
      enabledModules: snapshot.enabledModules,
      createdAt: snapshot.createdAt,
      seed,
      idempotency: new Map(),
      pendingSystemTurns: [],
      meta: snapshot.meta ? { ...snapshot.meta } : {},
      busy: false,
    };

    // Restore idempotency map from snapshot turnIds + passages
    const revision = state.meta.revision;
    for (const [clientId, turnId] of Object.entries(snapshot.idempotency ?? {})) {
      const passage = [...passages.values()].find((p) => p.turnId === turnId);
      if (!passage) continue;
      sessionState.idempotency.set(clientId, {
        status: "committed",
        turnId,
        sessionId,
        revision,
        passage,
        acceptedCommands: [],
        warnings: [],
      });
    }

    const hydrateCtx = createTurnContext({
      turnId: createTurnId(),
      sessionId,
      getStateView: () => kernel.getAuthoritative() as WorldState,
      propose: () => err(failure("INTERNAL", "propose closed during hydrate")),
      requestAgent: async (task) => ({
        ok: false,
        taskId: task.taskId,
        error: { code: "HYDRATE", message: "agents unavailable during hydrate" },
      }),
      note: () => undefined,
      extras: {},
      log: this.log.child({ sessionId }),
      permissions: createCorePermissionChecker(),
    });

    for (const owned of this.index.sessionHydrators) {
      const result = await owned.value.hydrate(
        { state: kernel.getAuthoritative() as WorldState },
        hydrateCtx,
      );
      if (!result.ok) return result;
    }

    this.sessions.set(sessionId, sessionState);

    // Synthetic restore turn: rebuild public views without LLM / without state change.
    // Uses kind=restore; if no open narrative needed, still produces a soft passage only when last is missing.
    if (!sessionState.lastPassage) {
      const restore = await this.pipeline.run(
        sessionState,
        { kind: "system", text: "restore" },
        createTurnId(),
        "restore",
      );
      if (restore.status === "rejected") {
        this.log.warn(
          { failure: restore.failure },
          "restore turn rejected (session still loaded)",
        );
      }
    }

    return ok(this.asSessionHandle(sessionId));
  }

  /**
   * @inheritdoc
   */
  async submitAction(
    sessionId: string,
    action: PlayerAction,
  ): Promise<TurnResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        status: "rejected",
        turnId: createTurnId(),
        sessionId,
        failure: {
          turnId: "unknown",
          code: "INTERNAL",
          message: `unknown session: ${sessionId}`,
        },
        warnings: [],
      };
    }

    if (action.clientActionId) {
      const prior = session.idempotency.get(action.clientActionId);
      if (prior) {
        return prior;
      }
    }

    if (session.busy) {
      const turnId = createTurnId();
      return {
        status: "rejected",
        turnId,
        sessionId,
        failure: {
          turnId,
          code: "INTERNAL",
          message: "SESSION_BUSY: another turn is in progress",
          stage: "begin",
        },
        warnings: [],
      };
    }

    session.busy = true;
    try {
      const turnId = createTurnId();
      const result = await this.pipeline.run(session, action, turnId, "player");
      if (action.clientActionId) {
        this.rememberIdempotency(session, action.clientActionId, result);
      }

      // Drain scheduled system turns after successful player turn
      if (result.status === "committed") {
        await this.drainSystemTurns(session);
      }

      return result;
    } finally {
      session.busy = false;
    }
  }

  /**
   * Runs a system turn explicitly (host/runtime).
   *
   * @param sessionId - session id
   * @param reason - system reason text
   * @param payload - optional payload stored on action extras via text encoding
   */
  async submitSystemTurn(
    sessionId: string,
    reason: string,
    payload?: JsonObject,
  ): Promise<TurnResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const turnId = createTurnId();
      return {
        status: "rejected",
        turnId,
        sessionId,
        failure: {
          turnId,
          code: "INTERNAL",
          message: `unknown session: ${sessionId}`,
        },
        warnings: [],
      };
    }
    if (session.busy) {
      const turnId = createTurnId();
      return {
        status: "rejected",
        turnId,
        sessionId,
        failure: {
          turnId,
          code: "INTERNAL",
          message: "SESSION_BUSY: another turn is in progress",
          stage: "begin",
        },
        warnings: [],
      };
    }
    session.busy = true;
    try {
      return await this.pipeline.run(
        session,
        {
          kind: "system",
          text: reason,
          payload,
        },
        createTurnId(),
        "system",
      );
    } finally {
      session.busy = false;
    }
  }

  /**
   * Replays journal entries onto the initial empty/core state for verification.
   *
   * @param sessionId - session id
   * @param toRevision - optional inclusive revision cap
   */
  async replaySessionJournal(
    sessionId: string,
    toRevision?: number,
  ): Promise<
    Result<
      {
        state: WorldState;
        appliedEntries: number;
        lastRevision: number;
        matchesLive: boolean;
      },
      Failure
    >
  > {
    const live = this.sessions.get(sessionId);
    const loaded = await this.persistence.load(sessionId);
    if (!loaded.ok) return loaded;
    if (!loaded.value && !live) {
      return err(failure("INTERNAL", `session not found: ${sessionId}`));
    }

    const journal = await this.persistence.readJournal(sessionId);
    if (!journal.ok) return journal;

    // Prefer earliest snapshot: reconstruct from empty + journal when possible.
    const initial = createEmptyWorldState(
      loaded.value?.createdAt ?? live?.createdAt ?? this.clock.nowIso(),
    );
    // Apply slice initials
    const slices: Record<string, JsonObject> = { ...initial.slices };
    for (const [name, owned] of this.index.slices) {
      slices[name] = owned.value.initialValue
        ? { ...owned.value.initialValue }
        : {};
    }
    const base: WorldState = { ...initial, slices };

    const replayed = replayJournal({
      initialState: base,
      entries: journal.value as JournalEntry[],
      commands: [
        ...createCoreCommandDefinitions(),
        ...[...this.index.commands.values()].map((o) => o.value),
      ],
      invariants: this.index.invariants.map((o) => o.value),
      toRevision,
    });
    if (!replayed.ok) return replayed;

    const liveState =
      live?.kernel.getAuthoritative() ?? loaded.value?.state ?? null;
    const matchesLive =
      liveState !== null &&
      liveState.meta.revision === replayed.value.state.meta.revision &&
      liveState.core.turnIndex === replayed.value.state.core.turnIndex;

    return ok({
      ...replayed.value,
      matchesLive,
    });
  }

  /**
   * @inheritdoc
   */
  async getPassage(
    sessionId: string,
  ): Promise<Result<Passage | null, Failure>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(failure("INTERNAL", `unknown session: ${sessionId}`));
    }
    return ok(session.lastPassage);
  }

  /**
   * @inheritdoc
   */
  async save(sessionId: string): Promise<Result<SavePointer, Failure>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(failure("INTERNAL", `unknown session: ${sessionId}`));
    }
    const now = this.clock.nowIso();
    const state = session.kernel.getAuthoritative() as WorldState;

    // Host save metadata contributions
    const metaCtx = createTurnContext({
      turnId: createTurnId(),
      sessionId,
      getStateView: () => state,
      propose: () => err(failure("INTERNAL", "propose closed during save meta")),
      requestAgent: async (task) => ({
        ok: false,
        taskId: task.taskId,
        error: { code: "SAVE", message: "agents unavailable during save" },
      }),
      note: () => undefined,
      extras: {},
      log: this.log.child({ sessionId }),
      permissions: createCorePermissionChecker(),
    });
    const saveMeta = await this.hostSurface.getSaveMetadata(state, metaCtx);
    const extraMeta = saveMeta.ok ? saveMeta.value : {};

    const saved = await this.persistence.save({
      formatVersion: SESSION_FORMAT_VERSION,
      sessionId,
      createdAt: session.createdAt,
      updatedAt: now,
      engine: {
        coreVersion: CORE_VERSION,
        contractsVersion: CONTRACTS_VERSION,
      },
      enabledModules: [...session.enabledModules],
      state,
      lastPassageId: session.lastPassage?.id,
      passages: [...session.passages.values()],
      idempotency: Object.fromEntries(
        [...session.idempotency.entries()].map(([k, v]) => [k, v.turnId]),
      ),
      meta: {
        ...(session.meta ?? {}),
        ...(session.seed ? { seed: session.seed } : {}),
        ...extraMeta,
      },
    });
    if (!saved.ok) return saved;
    return ok({
      sessionId,
      revision: state.meta.revision,
      savedAt: now,
    });
  }

  /**
   * @inheritdoc
   */
  async stopSession(sessionId: string): Promise<Result<void, Failure>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(failure("INTERNAL", `unknown session: ${sessionId}`));
    }
    this.sessions.delete(sessionId);
    return ok(undefined);
  }

  /**
   * @inheritdoc
   */
  async stop(): Promise<Result<void, Failure>> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.stopSession(sessionId);
    }
    return this.registry.stopAll();
  }

  /**
   * Test helper: access session kernel state.
   *
   * @param sessionId - session id
   */
  getSessionState(sessionId: string): WorldState | undefined {
    const session = this.sessions.get(sessionId);
    return session
      ? (session.kernel.getAuthoritative() as WorldState)
      : undefined;
  }

  /**
   * Pending system turns queued for a session (test/host inspection).
   *
   * @param sessionId - session id
   */
  getPendingSystemTurns(sessionId: string): readonly PendingSystemTurn[] {
    return this.sessions.get(sessionId)?.pendingSystemTurns ?? [];
  }

  private prepareKernel(kernel: StateKernel): Result<void, Failure> {
    for (const def of createCoreCommandDefinitions()) {
      const reg = kernel.registerCommand(def);
      if (!reg.ok) return reg;
    }
    for (const owned of this.index.commands.values()) {
      const reg = kernel.registerCommand(owned.value);
      if (!reg.ok) return reg;
    }
    for (const owned of this.index.invariants) {
      const reg = kernel.registerInvariant(owned.value);
      if (!reg.ok) return reg;
    }
    return ok(undefined);
  }

  private rememberIdempotency(
    session: SessionTurnState,
    clientActionId: string,
    result: TurnResult,
  ): void {
    session.idempotency.set(clientActionId, result);
    const limit = this.config.turn.idempotencyLimit;
    if (session.idempotency.size <= limit) return;
    const overflow = session.idempotency.size - limit;
    const keys = session.idempotency.keys();
    for (let i = 0; i < overflow; i++) {
      const next = keys.next();
      if (next.done) break;
      session.idempotency.delete(next.value);
    }
  }

  private async drainSystemTurns(
    session: SessionTurnState & { busy: boolean },
  ): Promise<void> {
    // busy already true from player turn; run nested without releasing lock.
    // Snapshot the queue so system turns cannot re-enqueue infinitely in one drain.
    const batch = session.pendingSystemTurns.splice(
      0,
      session.pendingSystemTurns.length,
    );
    const max = 16;
    let n = 0;
    for (const next of batch) {
      if (n >= max) {
        // put remainder back
        session.pendingSystemTurns.unshift(...batch.slice(n));
        break;
      }
      n += 1;
      const result = await this.pipeline.run(
        session,
        {
          kind: "system",
          text: next.reason,
          payload: next.payload,
        },
        createTurnId(),
        "system",
      );
      if (result.status === "rejected") {
        this.log.warn(
          { reason: next.reason, failure: result.failure },
          "scheduled system turn rejected",
        );
        break;
      }
    }
  }

  private asSessionHandle(sessionId: string): Session {
    return {
      sessionId,
      submitAction: (action) => this.submitAction(sessionId, action),
      getPassage: () => this.getPassage(sessionId),
      save: () => this.save(sessionId),
      stop: () => this.stopSession(sessionId),
    };
  }
}

export type { Module, ModuleFactory };
