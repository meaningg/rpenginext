import { defineModule, deny } from "@rpengineext/module-sdk";
import type { AgentTask, JsonObject, WorldState } from "@rpengineext/contracts";
import { z } from "zod";

import {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  EXTRAS_OUTFIT_PROPOSAL,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  READ_MODEL_PROFILE,
  SLICE_NAME,
  SYSTEM_REASON_OUTFIT_SYNC,
  TASK_TYPES,
  TOOL_IDS,
} from "./constants.ts";
import { buildOutfitSyncMessages } from "./outfit-sync-messages.ts";
import {
  CharacterSliceSchema,
  createEmptyCharacterSlice,
  OutfitSyncInputSchema,
  OutfitSyncOutputSchema,
  parseCharacterSlice,
  SeedCharacterPayloadSchema,
  SetOutfitPayloadSchema,
  StoryCharacterSchema,
  toCharacterProfile,
  UPDATE_OUTFIT_PARAMETERS_JSON,
  UpdateOutfitArgsSchema,
  UpdateOutfitResultSchema,
  type CharacterSlice,
  type SeedCharacterPayload,
  type SetOutfitPayload,
  type StoryCharacter,
} from "./schema.ts";

export {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  EXTRAS_OUTFIT_PROPOSAL,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  READ_MODEL_PROFILE,
  SLICE_NAME,
  SYSTEM_REASON_OUTFIT_SYNC,
  TASK_TYPES,
  TOOL_IDS,
} from "./constants.ts";
export {
  createEmptyCharacterSlice,
  parseCharacterSlice,
  StoryCharacterSchema,
  toCharacterProfile,
  type CharacterProfile,
  type CharacterSlice,
  type StoryCharacter,
} from "./schema.ts";
export { buildOutfitSyncMessages } from "./outfit-sync-messages.ts";

/**
 * Creates the player-character product module (sdk / CBMD).
 */
export function createCharacterModule() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "Player Character",
    description:
      "Seeds PC from story JSON, injects into narrative prompt, background outfit sync via tool-calling agent",
    priority: 20,
    provides: [CAPABILITY_ID],

    state: {
      name: SLICE_NAME,
      schemaVersion: 1,
      schema: CharacterSliceSchema,
      initial: createEmptyCharacterSlice(),
      ops: {
        seed: {
          payload: SeedCharacterPayloadSchema,
          apply: (_s: CharacterSlice, p: SeedCharacterPayload): CharacterSlice => ({
            schemaVersion: 1,
            present: true,
            name: p.name.trim(),
            appearance: p.appearance.trim(),
            features: p.features.trim(),
            outfit: p.outfit.trim(),
          }),
        },
        set_outfit: {
          payload: SetOutfitPayloadSchema,
          apply: (s: CharacterSlice, p: SetOutfitPayload): CharacterSlice => {
            if (!s.present) {
              deny("COMMAND_INVALID", "cannot set outfit: character not present");
            }
            const outfit = p.outfit.trim();
            if (!outfit) {
              deny("COMMAND_INVALID", "outfit must be a non-empty string");
            }
            return { ...s, outfit };
          },
        },
      },
    },

    seed: {
      fromMeta: "character",
      parse: StoryCharacterSchema,
      apply: (value, ctx) => {
        const c = value as StoryCharacter;
        ctx.op(
          "seed",
          {
            name: c.name.trim(),
            appearance: c.appearance.trim(),
            features: c.features.trim(),
            outfit: c.outfit.trim(),
          },
          "seed player character from story template",
        );
      },
    },

    narrative: {
      system: ({ slice }) => {
        const s = slice as CharacterSlice;
        if (!s.present) return null;
        return {
          id: "character.profile",
          channel: "system",
          title: "PLAYER CHARACTER",
          priority: 20,
          text: [
            `Name: ${s.name}`,
            `Appearance: ${s.appearance}`,
            `Traits / features: ${s.features}`,
            `Current outfit: ${s.outfit}`,
            "Keep the character consistent with this description unless the current action changes something.",
          ].join("\n"),
        };
      },
      brief: ({ slice }): JsonObject => {
        const s = slice as CharacterSlice;
        if (!s.present) return { present: false };
        return {
          present: true,
          name: s.name,
          appearance: s.appearance,
          features: s.features,
          outfit: s.outfit,
        };
      },
    },

    turn: {
      committed(ctx) {
        if (ctx.turnKind !== "player") return;
        const action = ctx.action;
        if (!action || action.kind !== "free_text") return;
        const userText = action.text?.trim() ?? "";
        if (!userText) return;
        const prose = ctx.passage?.prose.trim() ?? "";
        if (!prose) return;
        const slice = ctx.slice as CharacterSlice;
        if (!slice.present) return;

        ctx.scheduleSystem({
          reason: SYSTEM_REASON_OUTFIT_SYNC,
          mode: "background",
          payload: {
            sourceTurnId: ctx.passage!.turnId,
            userText,
            prose,
            characterBefore: {
              name: slice.name,
              appearance: slice.appearance,
              features: slice.features,
              outfit: slice.outfit,
            },
          },
        });
      },
    },

    ai: {
      tasks: {
        outfit_sync: {
          description:
            "Decide whether PC outfit changed this turn; may call character.update_outfit",
          input: OutfitSyncInputSchema as unknown as z.ZodType<JsonObject>,
          output: OutfitSyncOutputSchema as unknown as z.ZodType<JsonObject>,
          optional: true,
          timeoutMs: 20_000,
          maxRepairAttempts: 1,
          maxToolRounds: 3,
          temperature: 0.2,
          tools: ["update_outfit"],
          runOn: { systemReason: SYSTEM_REASON_OUTFIT_SYNC },
          messages: (input, task) =>
            buildOutfitSyncMessages({
              ...task,
              input,
            } as AgentTask),
        },
      },
      tools: {
        update_outfit: {
          description:
            "Set the player character outfit to a full single-string description",
          args: UpdateOutfitArgsSchema as unknown as z.ZodType<JsonObject>,
          result: UpdateOutfitResultSchema as unknown as z.ZodType<JsonObject>,
          parametersJsonSchema: UPDATE_OUTFIT_PARAMETERS_JSON,
          handler: (args, ctx) => {
            const outfit = String(args.outfit ?? "").trim();
            if (!outfit) {
              deny("SCHEMA_INVALID", "outfit must be non-empty");
            }
            ctx.proposeOp("set_outfit", { outfit }, SYSTEM_REASON_OUTFIT_SYNC);
            return { ok: true as const, outfit };
          },
        },
      },
    },

    host: {
      status: ({ slice }) => {
        const s = slice as CharacterSlice;
        if (!s.present) return [];
        return [
          { slot: "character.name", text: `Character: ${s.name}` },
          { slot: "character.outfit", text: `Outfit: ${s.outfit}` },
        ];
      },
      readModels: {
        [READ_MODEL_PROFILE]: (state: WorldState) => {
          const s = parseCharacterSlice(state.slices[SLICE_NAME]);
          return toCharacterProfile(s);
        },
      },
    },
  });
}
