import {
  ok,
  type CommandDefinition,
  type Module,
  type SliceDefinition,
} from "@rpengineext/contracts";

import { applyAppendPair } from "./apply/append-pair.ts";
import {
  resolveWorkingMemoryConfig,
  WorkingMemoryConfigSchema,
} from "./config.ts";
import {
  COMMAND_TYPES,
  CONFIG_KEY,
  MODULE_ID,
  SLICE_NAME,
} from "./constants.ts";
import { createNarrativeContextProvider } from "./handlers/narrative-context.ts";
import { createPostNarrativeContributor } from "./handlers/post-narrative.ts";
import { workingMemoryManifest } from "./manifest.ts";
import { createWorkingMemoryReadModels } from "./read-models.ts";
import { AppendPairPayloadJsonSchema } from "./schema/commands.ts";
import {
  createEmptyWorkingMemorySlice,
  WorkingMemorySliceJsonSchema,
} from "./schema/slice.ts";

export {
  CAPABILITY_ID,
  COMMAND_TYPES,
  CONFIG_KEY,
  DEFAULT_WINDOW_PAIRS,
  MODULE_ID,
  NARRATIVE_NAMESPACE,
  SLICE_NAME,
} from "./constants.ts";
export {
  readWorkingMemoryWindowFromEnv,
  resolveWorkingMemoryConfig,
  WorkingMemoryConfigSchema,
  type WorkingMemoryConfig,
} from "./config.ts";
export {
  buildPromptHistory,
  flattenPairsToHistory,
  selectLastPairs,
  type HistoryMessage,
} from "./selectors/window.ts";
export type { WorkingMemoryPair } from "./schema/pair.ts";
export type { WorkingMemorySlice } from "./schema/slice.ts";

export interface CreateWorkingMemoryModuleOptions {
  /**
   * Number of pairs injected into narrative.write (not archive cap).
   * Host should pass the same value via moduleConfig.working_memory.windowPairs.
   */
  readonly windowPairs?: number;
}

/**
 * Creates the working-memory product module.
 *
 * @param options - factory options (windowPairs from host env)
 */
export function createWorkingMemoryModule(
  options: CreateWorkingMemoryModuleOptions = {},
): Module {
  const config = resolveWorkingMemoryConfig(options);

  const sliceDef: SliceDefinition = {
    name: SLICE_NAME,
    schemaVersion: 1,
    schema: WorkingMemorySliceJsonSchema,
    initialValue: createEmptyWorkingMemorySlice() as never,
  };

  const appendCommand: CommandDefinition = {
    type: COMMAND_TYPES.appendPair,
    slice: SLICE_NAME,
    payloadSchema: AppendPairPayloadJsonSchema,
    apply: applyAppendPair,
  };

  return {
    manifest: workingMemoryManifest,
    register(ctx) {
      ctx.registerSlice(sliceDef);
      ctx.registerCommand(appendCommand);
      ctx.registerConfigSchema({
        key: CONFIG_KEY,
        schema: WorkingMemoryConfigSchema,
      });
      ctx.registerCapability(workingMemoryManifest.provides[0]!);

      for (const rm of createWorkingMemoryReadModels(config)) {
        ctx.registerReadModel(rm);
      }

      ctx.addNarrativeContextProvider(createNarrativeContextProvider(config));
      ctx.addPostNarrativeContributor(createPostNarrativeContributor());

      ctx.log.info(
        { moduleId: MODULE_ID, windowPairs: config.windowPairs },
        "working-memory module registered",
      );
      return;
    },
  };
}

/**
 * No-op helper kept for tree-shaking-friendly re-exports in tests.
 */
export function workingMemoryOk(): typeof ok {
  return ok;
}
