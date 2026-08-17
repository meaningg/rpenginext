import {
  err,
  failure,
  ok,
  type Failure,
  type Result,
  type StateCommand,
  type WorldState,
} from "@rpengineext/contracts";

import { SLICE_NAME } from "../constants.ts";
import {
  createEmptyWorkingMemorySlice,
  parseWorkingMemorySlice,
  type WorkingMemorySlice,
} from "../schema/slice.ts";
import {
  AppendPairPayloadSchema,
  type AppendPairPayload,
} from "../schema/commands.ts";

/**
 * Pure apply for `working_memory.append_pair`.
 *
 * @param state - draft world state
 * @param command - append command
 */
export function applyAppendPair(
  state: WorldState,
  command: StateCommand,
): Result<WorldState, Failure> {
  const parsed = AppendPairPayloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return err(
      failure("SCHEMA_INVALID", "working_memory.append_pair payload invalid", {
        details: parsed.error.flatten(),
      }),
    );
  }
  const payload: AppendPairPayload = parsed.data;
  const current = parseWorkingMemorySlice(state.slices[SLICE_NAME]);
  const nextSlice: WorkingMemorySlice = {
    schemaVersion: 1,
    entries: [
      ...current.entries,
      {
        turnId: payload.turnId,
        user: payload.user,
        assistant: payload.assistant,
        createdAt: payload.createdAt,
      },
    ],
  };

  return ok({
    ...state,
    slices: {
      ...state.slices,
      [SLICE_NAME]: nextSlice as unknown as WorldState["slices"][string],
    },
  });
}

/**
 * Ensures slice exists before first write (defensive).
 *
 * @param state - world state
 */
export function ensureWorkingMemorySlice(state: WorldState): WorldState {
  if (state.slices[SLICE_NAME]) return state;
  return {
    ...state,
    slices: {
      ...state.slices,
      [SLICE_NAME]: createEmptyWorkingMemorySlice() as unknown as WorldState["slices"][string],
    },
  };
}
