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
import { SeedWorldCanonPayloadSchema } from "../schema/commands.ts";
import type { WorldCanonSlice } from "../schema/slice.ts";

/**
 * Applies world_canon.seed command.
 *
 * @param state - draft world state
 * @param command - seed command
 */
export function applySeed(
  state: WorldState,
  command: StateCommand,
): Result<WorldState, Failure> {
  const parsed = SeedWorldCanonPayloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return err(
      failure("SCHEMA_INVALID", "invalid world_canon.seed payload", {
        details: parsed.error.flatten(),
      }),
    );
  }

  const next: WorldCanonSlice = {
    schemaVersion: 1,
    present: true,
    text: parsed.data.text.trim(),
  };

  if (next.text.length === 0) {
    return err(
      failure("SCHEMA_INVALID", "world_canon.seed text must be non-empty"),
    );
  }

  return ok({
    ...state,
    slices: {
      ...state.slices,
      [SLICE_NAME]: next as never,
    },
  });
}
