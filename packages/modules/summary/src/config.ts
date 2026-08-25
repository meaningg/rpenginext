import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";
import { readWorkingMemoryWindowFromEnv } from "@rpengineext/module-working-memory";

/**
 * Validated host config section for the summary module.
 *
 * The default ALWAYS follows the working-memory window variable
 * (`RP_WORKING_MEMORY_WINDOW`) — the module has no independent default,
 * so the interval <= window guarantee (no gaps) holds by default.
 *
 * @param defaultIntervalTurns - resolved default (usually the working-memory window)
 */
export function buildSummaryConfigSchema(defaultIntervalTurns: number) {
  return z
    .object({
      /**
       * How many working-memory pairs between summary chunks.
       */
      intervalTurns: z.number().int().positive().default(defaultIntervalTurns),
    })
    .strict();
}

export type SummaryConfig = {
  readonly intervalTurns: number;
};

/**
 * Resolves module options with defaults.
 *
 * Explicit `intervalTurns` wins; otherwise the interval is taken from the
 * working-memory window variable (`RP_WORKING_MEMORY_WINDOW`), mirroring the
 * working-memory module semantics.
 *
 * @param options - factory options
 */
export function resolveSummaryConfig(options?: {
  readonly intervalTurns?: number;
  readonly env?: Record<string, string | undefined>;
}): SummaryConfig {
  const raw = options?.intervalTurns;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return { intervalTurns: raw };
  }
  const windowPairs = readWorkingMemoryWindowFromEnv(options?.env);
  return { intervalTurns: windowPairs };
}
