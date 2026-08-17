import {
  type CommandDefinition,
  type Module,
  type SliceDefinition,
} from "@rpengineext/contracts";

import { applySeed } from "./apply/seed.ts";
import { COMMAND_TYPES, MODULE_ID, SLICE_NAME } from "./constants.ts";
import { createNarrativeContextProvider } from "./handlers/narrative-context.ts";
import { createNarrativePromptContributor } from "./handlers/prompt-contributor.ts";
import { createSessionBootstrap } from "./handlers/session-bootstrap.ts";
import { worldCanonManifest } from "./manifest.ts";
import { SeedWorldCanonPayloadJsonSchema } from "./schema/commands.ts";
import {
  createEmptyWorldCanonSlice,
  WorldCanonSliceJsonSchema,
} from "./schema/slice.ts";

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
export type { WorldCanonSlice } from "./schema/slice.ts";
export type { StoryWorldCanon } from "./schema/commands.ts";
export {
  parseWorldCanonSlice,
  createEmptyWorldCanonSlice,
} from "./schema/slice.ts";
export { StoryWorldCanonSchema } from "./schema/commands.ts";

/**
 * Creates the world-canon product module.
 */
export function createWorldCanonModule(): Module {
  const sliceDef: SliceDefinition = {
    name: SLICE_NAME,
    schemaVersion: 1,
    schema: WorldCanonSliceJsonSchema,
    initialValue: createEmptyWorldCanonSlice() as never,
  };

  const seedCommand: CommandDefinition = {
    type: COMMAND_TYPES.seed,
    slice: SLICE_NAME,
    payloadSchema: SeedWorldCanonPayloadJsonSchema,
    apply: applySeed,
  };

  return {
    manifest: worldCanonManifest,
    register(ctx) {
      ctx.registerSlice(sliceDef);
      ctx.registerCommand(seedCommand);
      ctx.registerCapability(worldCanonManifest.provides[0]!);

      ctx.addSessionBootstrap(createSessionBootstrap());
      ctx.addNarrativeContextProvider(createNarrativeContextProvider());
      ctx.addNarrativePromptContributor(createNarrativePromptContributor());

      ctx.log.info({ moduleId: MODULE_ID }, "world-canon module registered");
      return;
    },
  };
}
