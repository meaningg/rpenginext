import {
  err,
  failure,
  ok,
  type CommandDefinition,
  type Failure,
  type InvariantDefinition,
  type JournalEntry,
  type Result,
  type WorldState,
} from "@rpengineext/contracts";

import { StateKernel } from "./state-kernel.ts";

export interface JournalReplayInput {
  readonly initialState: WorldState;
  readonly entries: readonly JournalEntry[];
  readonly commands: readonly CommandDefinition[];
  readonly invariants?: readonly InvariantDefinition[];
  /** Stop after this nextRevision (inclusive). */
  readonly toRevision?: number;
}

export interface JournalReplayResult {
  readonly state: WorldState;
  readonly appliedEntries: number;
  readonly lastRevision: number;
}

/**
 * Replays accepted journal commands onto an initial snapshot (no LLM).
 * Used for dev tools and determinism checks.
 *
 * @param input - replay parameters
 */
export function replayJournal(
  input: JournalReplayInput,
): Result<JournalReplayResult, Failure> {
  const kernel = new StateKernel(input.initialState);
  for (const def of input.commands) {
    const reg = kernel.registerCommand(def);
    if (!reg.ok) return reg;
  }
  for (const inv of input.invariants ?? []) {
    const reg = kernel.registerInvariant(inv);
    if (!reg.ok) return reg;
  }

  const ordered = [...input.entries].sort(
    (a, b) => a.prevRevision - b.prevRevision || a.nextRevision - b.nextRevision,
  );

  let applied = 0;
  for (const entry of ordered) {
    if (
      input.toRevision !== undefined &&
      entry.nextRevision > input.toRevision
    ) {
      break;
    }

    const auth = kernel.getAuthoritative() as WorldState;
    if (auth.meta.revision !== entry.prevRevision) {
      return err(
        failure(
          "INTERNAL",
          `journal gap: state revision ${auth.meta.revision} != entry.prevRevision ${entry.prevRevision}`,
          {
            details: {
              turnId: entry.turnId,
              stateRevision: auth.meta.revision,
              prevRevision: entry.prevRevision,
            },
          },
        ),
      );
    }

    const begin = kernel.beginTurn(entry.turnId);
    if (!begin.ok) return begin;

    const dry = kernel.dryApply(entry.commands);
    if (!dry.ok) {
      kernel.discard();
      return err(
        failure(
          dry.error.code || "COMMAND_INVALID",
          `replay failed on turn ${entry.turnId}: ${dry.error.message}`,
          { details: dry.error.details, causedBy: dry.error.causedBy },
        ),
      );
    }

    const committed = kernel.commit();
    if (!committed.ok) return committed;

    const next = committed.value;
    if (next.meta.revision !== entry.nextRevision) {
      return err(
        failure(
          "INTERNAL",
          `replay revision mismatch on turn ${entry.turnId}: got ${next.meta.revision}, expected ${entry.nextRevision}`,
        ),
      );
    }
    applied += 1;
  }

  const finalState = kernel.getAuthoritative() as WorldState;
  return ok({
    state: finalState,
    appliedEntries: applied,
    lastRevision: finalState.meta.revision,
  });
}
