import {
  failure,
  type Failure,
  type PlayerAction,
  type Result,
  type TurnResult,
  err,
  ok,
} from "@rpengineext/contracts";
import type { Engine } from "@rpengineext/contracts";
import type { EventBus } from "@rpengineext/core";
import type { Logger } from "@rpengineext/logger";

export type TurnJobStatus = "running" | "committed" | "rejected";

export interface TurnJob {
  readonly turnId: string;
  readonly sessionId: string;
  readonly status: TurnJobStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly result?: TurnResult;
  readonly errorMessage?: string;
}

/**
 * Tracks async turn jobs and enforces process-wide concurrency limits.
 */
export class TurnService {
  private readonly engine: Engine;
  private readonly events: EventBus;
  private readonly log: Logger;
  private readonly maxConcurrentTurns: number;
  private activeTurns = 0;
  private readonly jobs = new Map<string, TurnJob>();
  /** sessionId -> latest turnId */
  private readonly latestBySession = new Map<string, string>();

  /**
   * @param options - deps
   */
  constructor(options: {
    readonly engine: Engine;
    readonly events: EventBus;
    readonly log: Logger;
    readonly maxConcurrentTurns: number;
  }) {
    this.engine = options.engine;
    this.events = options.events;
    this.log = options.log.child({ component: "turn-service" });
    this.maxConcurrentTurns = options.maxConcurrentTurns;
  }

  /**
   * Returns a turn job if known.
   *
   * @param turnId - turn id
   */
  getJob(turnId: string): TurnJob | undefined {
    return this.jobs.get(turnId);
  }

  /**
   * Latest job for a session.
   *
   * @param sessionId - session id
   */
  getLatestForSession(sessionId: string): TurnJob | undefined {
    const id = this.latestBySession.get(sessionId);
    return id ? this.jobs.get(id) : undefined;
  }

  /**
   * Starts a turn asynchronously and returns provisional turnId after start event.
   * If wait=true, resolves with full TurnResult.
   *
   * @param sessionId - session
   * @param action - player action
   * @param wait - block until finished
   */
  async submit(
    sessionId: string,
    action: PlayerAction,
    wait: boolean,
  ): Promise<
    Result<
      | { readonly mode: "async"; readonly turnId: string; readonly sessionId: string }
      | { readonly mode: "sync"; readonly result: TurnResult },
      Failure
    >
  > {
    if (this.activeTurns >= this.maxConcurrentTurns) {
      return err(
        failure(
          "INTERNAL",
          "server is at max concurrent turns; retry shortly",
        ),
      );
    }

    this.activeTurns += 1;
    let capturedTurnId: string | undefined;
    this.log.info(
      {
        sessionId,
        wait,
        actionKind: action.kind,
        activeTurns: this.activeTurns,
      },
      "turn submit",
    );

    const unsub = this.events.subscribe("turn.started", (event) => {
      if (event.type !== "turn.started") return;
      if (event.sessionId === sessionId && !capturedTurnId) {
        capturedTurnId = event.turnId;
      }
    });

    const runPromise = this.engine
      .submitAction(sessionId, action)
      .then((result) => {
        const turnId = result.turnId;
        const finishedAt = new Date().toISOString();
        const prev = this.jobs.get(turnId);
        this.jobs.set(turnId, {
          turnId,
          sessionId,
          status: result.status === "committed" ? "committed" : "rejected",
          startedAt: prev?.startedAt ?? finishedAt,
          finishedAt,
          result,
        });
        this.latestBySession.set(sessionId, turnId);
        this.log.info(
          {
            sessionId,
            turnId,
            status: result.status,
          },
          "turn job finished",
        );
        return result;
      })
      .catch((error: unknown) => {
        const turnId = capturedTurnId ?? `trn_err_${Date.now()}`;
        const finishedAt = new Date().toISOString();
        this.jobs.set(turnId, {
          turnId,
          sessionId,
          status: "rejected",
          startedAt: finishedAt,
          finishedAt,
          errorMessage: String(error),
          result: {
            status: "rejected",
            turnId,
            sessionId,
            failure: {
              turnId,
              code: "INTERNAL",
              message: "turn execution failed",
            },
            warnings: [],
          },
        });
        this.log.error({ err: error, sessionId }, "turn execution threw");
        throw error;
      })
      .finally(() => {
        this.activeTurns = Math.max(0, this.activeTurns - 1);
        unsub();
      });

    // Give the pipeline a tick to emit turn.started
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    if (wait) {
      try {
        const result = await runPromise;
        return ok({ mode: "sync", result });
      } catch (error) {
        return err(
          failure("INTERNAL", "turn execution failed", {
            details: String(error),
          }),
        );
      }
    }

    // Wait briefly for turnId from event; fallback after action resolves if needed
    const startedAt = new Date().toISOString();
    let turnId = capturedTurnId;
    if (!turnId) {
      // race: wait up to 50ms for started event
      for (let i = 0; i < 10 && !turnId; i++) {
        await new Promise((r) => setTimeout(r, 5));
        turnId = capturedTurnId;
      }
    }

    if (!turnId) {
      // still unknown — await completion for id
      try {
        const result = await runPromise;
        return ok({ mode: "async", turnId: result.turnId, sessionId });
      } catch (error) {
        return err(
          failure("INTERNAL", "turn failed before start", {
            details: String(error),
          }),
        );
      }
    }

    // Fast turns may finish before 202 returns; never overwrite a terminal job with running.
    if (!this.jobs.has(turnId)) {
      this.jobs.set(turnId, {
        turnId,
        sessionId,
        status: "running",
        startedAt,
      });
    }
    this.latestBySession.set(sessionId, turnId);
    void runPromise;
    return ok({ mode: "async", turnId, sessionId });
  }
}
