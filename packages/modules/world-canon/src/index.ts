import { defineModule } from "@rpengineext/module-sdk";
import type { JsonObject } from "@rpengineext/contracts";
import { z } from "zod";

import {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  MAX_CANON_LENGTH,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  PROMPT_SECTION_PRIORITY,
  SLICE_NAME,
} from "./constants.ts";
import {
  createEmptyWorldCanonSlice,
  parseWorldCanonSlice,
  StoryWorldCanonSchema,
  WorldCanonSliceSchema,
  type StoryWorldCanon,
  type WorldCanonSlice,
} from "./schema.ts";

export {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  MAX_CANON_LENGTH,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  PROMPT_SECTION_PRIORITY,
  SLICE_NAME,
} from "./constants.ts";
export {
  createEmptyWorldCanonSlice,
  parseWorldCanonSlice,
  StoryWorldCanonSchema,
  WorldCanonSliceSchema,
  type StoryWorldCanon,
  type WorldCanonSlice,
} from "./schema.ts";

/**
 * Creates the world-canon product module (sdk / CBMD).
 */
export function createWorldCanonModule() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "World Canon",
    description:
      "Seeds immutable world canon from story JSON and injects it into the narrative system prompt",
    priority: 15,
    provides: [CAPABILITY_ID],

    state: {
      name: SLICE_NAME,
      schemaVersion: 1,
      schema: WorldCanonSliceSchema,
      initial: createEmptyWorldCanonSlice(),
      ops: {
        seed: {
          payload: z.object({ text: z.string().min(1).max(MAX_CANON_LENGTH) }).strict(),
          apply: (_s: WorldCanonSlice, p: { text: string }): WorldCanonSlice => ({
            schemaVersion: 1,
            present: true,
            text: p.text.trim(),
          }),
        },
      },
    },

    seed: {
      fromMeta: "worldCanon",
      parse: StoryWorldCanonSchema,
      apply: (text, ctx) => {
        const trimmed = String(text).trim();
        if (!trimmed) return;
        ctx.op("seed", { text: trimmed }, "seed world canon from story template");
      },
    },

    narrative: {
      system: ({ slice }) => {
        const s = slice as WorldCanonSlice;
        if (!s.present || s.text.trim().length === 0) return null;
        return {
          id: "world_canon.text",
          channel: "system",
          title: "WORLD CANON (immutable established facts)",
          priority: PROMPT_SECTION_PRIORITY,
          text: [
            s.text.trim(),
            "Treat the above as established truth. Do not contradict it. Do not invent lore that overrides it.",
          ].join("\n"),
        };
      },
      brief: ({ slice }): JsonObject => {
        const s = slice as WorldCanonSlice;
        if (!s.present) return { present: false };
        return { present: true, charCount: s.text.length };
      },
    },
  });
}
