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
import { SetOutfitPayloadSchema } from "../schema/commands.ts";
import {
  parseCharacterSlice,
  type CharacterSlice,
} from "../schema/slice.ts";

/**
 * Applies character.set_outfit command.
 *
 * @param state - draft world state
 * @param command - set_outfit command
 */
export function applySetOutfit(
  state: WorldState,
  command: StateCommand,
): Result<WorldState, Failure> {
  const parsed = SetOutfitPayloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return err(
      failure("SCHEMA_INVALID", "invalid character.set_outfit payload", {
        details: parsed.error.flatten(),
      }),
    );
  }

  const current = parseCharacterSlice(state.slices[SLICE_NAME]);
  if (!current.present) {
    return err(
      failure("COMMAND_INVALID", "cannot set outfit: character not present"),
    );
  }

  const outfit = parsed.data.outfit.trim();
  if (!outfit) {
    return err(failure("COMMAND_INVALID", "outfit must be a non-empty string"));
  }

  const next: CharacterSlice = {
    ...current,
    outfit,
  };

  return ok({
    ...state,
    slices: {
      ...state.slices,
      [SLICE_NAME]: next as never,
    },
  });
}
