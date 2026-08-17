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
import { SeedCharacterPayloadSchema } from "../schema/commands.ts";
import type { CharacterSlice } from "../schema/slice.ts";

/**
 * Applies character.seed command.
 *
 * @param state - draft world state
 * @param command - seed command
 */
export function applySeed(
  state: WorldState,
  command: StateCommand,
): Result<WorldState, Failure> {
  const parsed = SeedCharacterPayloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return err(
      failure("SCHEMA_INVALID", "invalid character.seed payload", {
        details: parsed.error.flatten(),
      }),
    );
  }

  const next: CharacterSlice = {
    schemaVersion: 1,
    present: true,
    name: parsed.data.name.trim(),
    appearance: parsed.data.appearance.trim(),
    features: parsed.data.features.trim(),
    outfit: parsed.data.outfit.trim(),
  };

  return ok({
    ...state,
    slices: {
      ...state.slices,
      [SLICE_NAME]: next as never,
    },
  });
}
