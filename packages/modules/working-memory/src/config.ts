import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { DEFAULT_WINDOW_PAIRS } from "./constants.ts";

/**
 * Validated host config section for working-memory.
 */
export const WorkingMemoryConfigObjectSchema = z
  .object({
    windowPairs: z.number().int().positive().default(DEFAULT_WINDOW_PAIRS),
  })
  .strict();

export const WorkingMemoryConfigSchema =
  WorkingMemoryConfigObjectSchema as unknown as z.ZodType<JsonObject>;

export type WorkingMemoryConfig = {
  readonly windowPairs: number;
};

/**
 * Resolves module options with defaults.
 *
 * @param options - factory options
 */
export function resolveWorkingMemoryConfig(options?: {
  readonly windowPairs?: number;
}): WorkingMemoryConfig {
  const raw = options?.windowPairs;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return { windowPairs: raw };
  }
  return { windowPairs: DEFAULT_WINDOW_PAIRS };
}

/**
 * Reads `RP_WORKING_MEMORY_WINDOW` from an env bag.
 *
 * @param env - process env
 */
export function readWorkingMemoryWindowFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.RP_WORKING_MEMORY_WINDOW?.trim();
  if (!raw) return DEFAULT_WINDOW_PAIRS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return DEFAULT_WINDOW_PAIRS;
  }
  return n;
}
