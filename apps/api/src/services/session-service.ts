import {
  err,
  failure,
  ok,
  type Engine,
  type Failure,
  type Passage,
  type PlayerAction,
  type Result,
  type TurnResult,
} from "@rpengineext/contracts";
import type { StoryCatalog, StoryTemplate } from "@rpengineext/content-stories";
import { normalizeLocale } from "@rpengineext/core";
import type { Logger } from "@rpengineext/logger";

import type { HostDb, HostPlayer, HostSessionRow } from "../persistence/host-db.ts";
import type { TurnService } from "./turn-service.ts";

export interface SessionView {
  readonly sessionId: string;
  readonly playerId: string;
  readonly templateId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly passage: Passage | null;
}

/**
 * Session lifecycle with ownership checks.
 */
export class SessionService {
  private readonly engine: Engine;
  private readonly hostDb: HostDb;
  private readonly stories: StoryCatalog;
  private readonly turns: TurnService;
  private readonly log: Logger;
  private readonly maxSessionsPerPlayer: number;
  /** sessionIds loaded into engine memory this process */
  private readonly attached = new Set<string>();

  /**
   * @param options - deps
   */
  constructor(options: {
    readonly engine: Engine;
    readonly hostDb: HostDb;
    readonly stories: StoryCatalog;
    readonly turns: TurnService;
    readonly log: Logger;
    readonly maxSessionsPerPlayer: number;
  }) {
    this.engine = options.engine;
    this.hostDb = options.hostDb;
    this.stories = options.stories;
    this.turns = options.turns;
    this.log = options.log.child({ component: "session-service" });
    this.maxSessionsPerPlayer = options.maxSessionsPerPlayer;
  }

  /**
   * Lists player sessions.
   */
  listForPlayer(player: HostPlayer): Result<HostSessionRow[], Failure> {
    return this.hostDb.listSessions(player.playerId);
  }

  /**
   * Creates a session from a story template.
   */
  async createFromTemplate(
    player: HostPlayer,
    input: {
      readonly templateId: string;
      readonly title?: string;
      readonly runOpening: boolean;
    },
  ): Promise<
    Result<
      {
        readonly session: SessionView;
        readonly openingTurn?: TurnResult;
      },
      Failure
    >
  > {
    const template = this.stories.get(input.templateId);
    if (!template) {
      return err(
        failure("NOT_FOUND", `unknown template: ${input.templateId}`),
      );
    }

    const count = this.hostDb.countSessions(player.playerId);
    if (!count.ok) return count;
    if (count.value >= this.maxSessionsPerPlayer) {
      return err(
        failure(
          "VALIDATION",
          `session limit reached (${this.maxSessionsPerPlayer})`,
        ),
      );
    }

    const title =
      input.title?.trim() ||
      `${template.title} · ${new Date().toISOString().slice(0, 16)}`;

    const started = await this.engine.startSession({
      seed: template.seed,
      meta: {
        ...template.sessionMeta,
        templateId: template.id,
        playerId: player.playerId,
        title,
        ...(template.locale
          ? { locale: normalizeLocale(template.locale) }
          : {}),
        narrativeStyle: template.narrativeStyle ?? {},
        ...(template.character ? { character: template.character } : {}),
        ...(template.worldCanon ? { worldCanon: template.worldCanon } : {}),
      },
    });
    if (!started.ok) return started;

    const sessionId = started.value.sessionId;
    const bound = this.hostDb.bindSession({
      sessionId,
      playerId: player.playerId,
      templateId: template.id,
      title,
    });
    if (!bound.ok) {
      await this.engine.stopSession(sessionId);
      return bound;
    }
    this.attached.add(sessionId);

    let openingTurn: TurnResult | undefined;
    if (input.runOpening && template.openingAction) {
      const action: PlayerAction = {
        kind: "free_text",
        text: template.openingAction.text,
      };
      const submitted = await this.turns.submit(sessionId, action, true);
      if (submitted.ok && submitted.value.mode === "sync") {
        openingTurn = submitted.value.result;
      } else if (!submitted.ok) {
        this.log.warn(
          { err: submitted.error, sessionId },
          "opening action failed",
        );
      }
      this.hostDb.touchSession(sessionId);
    }

    const view = await this.getViewForOwner(player, sessionId);
    if (!view.ok) return view;
    return ok({ session: view.value, openingTurn });
  }

  /**
   * Ensures session is owned and loaded in memory.
   */
  async ensureAttached(
    player: HostPlayer,
    sessionId: string,
  ): Promise<Result<HostSessionRow, Failure>> {
    const owned = this.hostDb.getSession(sessionId);
    if (!owned.ok) return owned;
    if (!owned.value) {
      return err(failure("NOT_FOUND", `session not found: ${sessionId}`));
    }
    if (owned.value.playerId !== player.playerId) {
      return err(failure("PERMISSION_DENIED", "session is owned by another player"));
    }

    if (!this.attached.has(sessionId)) {
      const loaded = await this.engine.loadSession(sessionId);
      if (!loaded.ok) {
        // may already be in memory from another code path
        if (!loaded.error.message.includes("already")) {
          return loaded;
        }
      }
      this.attached.add(sessionId);
    }
    return ok(owned.value);
  }

  /**
   * Session summary + passage for owner.
   */
  async getViewForOwner(
    player: HostPlayer,
    sessionId: string,
  ): Promise<Result<SessionView, Failure>> {
    const row = await this.ensureAttached(player, sessionId);
    if (!row.ok) return row;
    const passage = await this.engine.getPassage(sessionId);
    if (!passage.ok) return passage;
    return ok({
      sessionId: row.value.sessionId,
      playerId: row.value.playerId,
      templateId: row.value.templateId,
      title: row.value.title,
      createdAt: row.value.createdAt,
      updatedAt: row.value.updatedAt,
      passage: passage.value,
    });
  }

  /**
   * Explicit save.
   */
  async save(
    player: HostPlayer,
    sessionId: string,
  ): Promise<Result<{ sessionId: string; revision: number; savedAt: string }, Failure>> {
    const row = await this.ensureAttached(player, sessionId);
    if (!row.ok) return row;
    const saved = await this.engine.save(sessionId);
    if (!saved.ok) return saved;
    this.hostDb.touchSession(sessionId);
    return ok({
      sessionId: saved.value.sessionId,
      revision: saved.value.revision,
      savedAt: saved.value.savedAt,
    });
  }

  /**
   * Renames a session owned by the player.
   *
   * @param player - owner
   * @param sessionId - session id
   * @param title - new title
   */
  async rename(
    player: HostPlayer,
    sessionId: string,
    title: string,
  ): Promise<Result<HostSessionRow, Failure>> {
    const owned = this.hostDb.getSession(sessionId);
    if (!owned.ok) return owned;
    if (!owned.value) {
      return err(failure("NOT_FOUND", `session not found: ${sessionId}`));
    }
    if (owned.value.playerId !== player.playerId) {
      return err(failure("PERMISSION_DENIED", "session is owned by another player"));
    }

    const nextTitle = title.trim();
    if (!nextTitle) {
      return err(failure("VALIDATION", "title must not be empty"));
    }

    const updated = this.hostDb.updateSessionTitle(sessionId, nextTitle);
    if (!updated.ok) return updated;
    if (!updated.value) {
      return err(failure("NOT_FOUND", `session not found: ${sessionId}`));
    }
    return ok(updated.value);
  }

  /**
   * Detaches and stops a session owned by the player.
   *
   * @param player - owner
   * @param sessionId - session id
   */
  async delete(
    player: HostPlayer,
    sessionId: string,
  ): Promise<Result<{ sessionId: string }, Failure>> {
    const owned = this.hostDb.getSession(sessionId);
    if (!owned.ok) return owned;
    if (!owned.value) {
      return err(failure("NOT_FOUND", `session not found: ${sessionId}`));
    }
    if (owned.value.playerId !== player.playerId) {
      return err(failure("PERMISSION_DENIED", "session is owned by another player"));
    }

    const removed = this.hostDb.deleteSession(sessionId);
    if (!removed.ok) return removed;
    if (!removed.value) {
      return err(failure("NOT_FOUND", `session not found: ${sessionId}`));
    }

    this.attached.delete(sessionId);
    const stopped = await this.engine.stopSession(sessionId);
    if (!stopped.ok) {
      // Already unloaded is fine after host unbind.
      if (!stopped.error.message.toLowerCase().includes("not found")) {
        this.log.warn(
          { err: stopped.error, sessionId },
          "engine stop after delete failed",
        );
      }
    }

    return ok({ sessionId });
  }

  /**
   * Submit action with ownership.
   */
  async submitAction(
    player: HostPlayer,
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
    const row = await this.ensureAttached(player, sessionId);
    if (!row.ok) return row;
    const result = await this.turns.submit(sessionId, action, wait);
    if (result.ok) {
      this.hostDb.touchSession(sessionId);
    }
    return result;
  }

  /**
   * Template lookup helper.
   */
  getTemplate(id: string): StoryTemplate | undefined {
    return this.stories.get(id);
  }

  /**
   * All templates.
   */
  listTemplates(): StoryTemplate[] {
    return this.stories.list();
  }
}
