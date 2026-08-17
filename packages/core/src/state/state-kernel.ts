import {
  err,
  failure,
  ok,
  type CommandDefinition,
  type Failure,
  type InvariantDefinition,
  type Result,
  type StateCommand,
  type WorldState,
} from "@rpengineext/contracts";

import { deepClone } from "../util/clone.ts";
import { deepFreeze } from "../util/freeze.ts";
import { validateCommandPayload } from "./core-commands.ts";

export interface CommandApplyRecord {
  readonly command: StateCommand;
  readonly accepted: boolean;
  readonly reason?: string;
}

export interface DryApplyResult {
  readonly draft: WorldState;
  readonly records: readonly CommandApplyRecord[];
  readonly acceptedCommands: readonly StateCommand[];
}

/**
 * Authoritative world state owner with draft dry-apply / commit / discard.
 */
export class StateKernel {
  private authoritative: WorldState;
  private draft: WorldState | null = null;
  private openTurnId: string | null = null;
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly invariants: InvariantDefinition[] = [];

  /**
   * @param initial - initial authoritative state
   */
  constructor(initial: WorldState) {
    this.authoritative = deepClone(initial);
  }

  /**
   * Registers or replaces a command definition in the catalog.
   *
   * @param def - command definition
   */
  registerCommand(def: CommandDefinition): Result<void, Failure> {
    if (this.commands.has(def.type)) {
      return err(
        failure("REGISTRATION_INVALID", `duplicate command type: ${def.type}`),
      );
    }
    this.commands.set(def.type, def);
    return ok(undefined);
  }

  /**
   * Registers a global/slice invariant checked after dry-apply.
   *
   * @param def - invariant definition
   */
  registerInvariant(def: InvariantDefinition): Result<void, Failure> {
    if (this.invariants.some((item) => item.id === def.id)) {
      return err(
        failure("REGISTRATION_INVALID", `duplicate invariant id: ${def.id}`),
      );
    }
    this.invariants.push(def);
    return ok(undefined);
  }

  /**
   * Returns a command definition if registered.
   *
   * @param type - command type
   */
  getCommand(type: string): CommandDefinition | undefined {
    return this.commands.get(type);
  }

  /**
   * Lists registered command types (sorted).
   */
  listCommandTypes(): readonly string[] {
    return [...this.commands.keys()].sort();
  }

  /**
   * Returns frozen authoritative state view.
   */
  getAuthoritative(): Readonly<WorldState> {
    return deepFreeze(deepClone(this.authoritative));
  }

  /**
   * Mutable clone of authoritative state (session bootstrap only).
   */
  replaceAuthoritative(state: WorldState): void {
    if (this.draft) {
      throw new Error("cannot replace authoritative state while a turn draft is open");
    }
    this.authoritative = deepClone(state);
  }

  /**
   * Opens a turn draft from current authoritative snapshot S0.
   *
   * @param turnId - turn id
   */
  beginTurn(turnId: string): Result<Readonly<WorldState>, Failure> {
    if (this.draft) {
      return err(
        failure("INTERNAL", "turn draft already open", {
          details: { openTurnId: this.openTurnId },
        }),
      );
    }
    this.openTurnId = turnId;
    this.draft = deepClone(this.authoritative);
    return ok(deepFreeze(deepClone(this.draft)));
  }

  /**
   * Returns frozen draft view (or authoritative if no draft).
   */
  getDraftView(): Readonly<WorldState> {
    const source = this.draft ?? this.authoritative;
    return deepFreeze(deepClone(source));
  }

  /**
   * Progressive dry-apply of commands onto the open draft.
   * Does not publish authoritative state.
   *
   * @param commands - candidate commands in deterministic order
   */
  dryApply(commands: readonly StateCommand[]): Result<DryApplyResult, Failure> {
    if (!this.draft) {
      return err(failure("INTERNAL", "no open turn draft for dry-apply"));
    }

    let working = deepClone(this.draft);
    const records: CommandApplyRecord[] = [];
    const accepted: StateCommand[] = [];

    for (const command of commands) {
      const def = this.commands.get(command.type);
      if (!def) {
        return err(
          failure(
            "COMMAND_INVALID",
            `unregistered command type: ${command.type}`,
            { details: { commandId: command.commandId } },
          ),
        );
      }

      if (def.slice !== command.slice) {
        return err(
          failure(
            "COMMAND_INVALID",
            `command ${command.type} targets slice "${command.slice}" but is registered for "${def.slice}"`,
          ),
        );
      }

      const payloadCheck = validateCommandPayload(def, command);
      if (!payloadCheck.ok) {
        return payloadCheck;
      }

      if (def.validate) {
        const custom = def.validate(working, command);
        if (!custom.ok) {
          return err(
            failure(
              custom.error.code || "COMMAND_INVALID",
              custom.error.message,
              {
                details: custom.error.details,
                causedBy: custom.error.causedBy,
              },
            ),
          );
        }
      }

      const applied = def.apply(working, command);
      if (!applied.ok) {
        return err(
          failure(
            applied.error.code || "COMMAND_INVALID",
            applied.error.message,
            {
              details: applied.error.details,
              causedBy: applied.error.causedBy,
            },
          ),
        );
      }

      working = applied.value;
      accepted.push(command);
      records.push({ command, accepted: true });
    }

    for (const invariant of this.invariants) {
      const check = invariant.check(working);
      if (!check.ok) {
        return err(
          failure(
            check.error.code || "INVARIANT_FAILED",
            check.error.message,
            {
              details: {
                invariantId: invariant.id,
                ...(typeof check.error.details === "object" &&
                check.error.details !== null
                  ? (check.error.details as object)
                  : { cause: check.error.details }),
              },
            },
          ),
        );
      }
    }

    this.draft = working;
    return ok({
      draft: deepClone(working),
      records,
      acceptedCommands: accepted,
    });
  }

  /**
   * Publishes draft as authoritative state.
   */
  commit(): Result<WorldState, Failure> {
    if (!this.draft) {
      return err(failure("INTERNAL", "no open turn draft to commit"));
    }
    this.authoritative = deepClone(this.draft);
    this.draft = null;
    this.openTurnId = null;
    return ok(deepClone(this.authoritative));
  }

  /**
   * Discards draft; authoritative remains S0.
   */
  discard(): void {
    this.draft = null;
    this.openTurnId = null;
  }

  /**
   * Whether a draft is currently open.
   */
  hasOpenDraft(): boolean {
    return this.draft !== null;
  }
}
