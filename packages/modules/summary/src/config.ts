import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

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
  const windowPairs = readSummaryIntervalFromEnv(options?.env);
  return { intervalTurns: windowPairs };
}

/**
 * Reads the working-memory window variable locally (boundary rule: no
 * module→module imports). Semantics mirror `module-working-memory` config;
 * kept in sync via docs/modules/conventions.md + public contracts.
 *
 * @param env - process env
 */
export function readSummaryIntervalFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  // Mirrors DEFAULT_WINDOW_PAIRS from the working-memory public contract.
  const raw = env.RP_WORKING_MEMORY_WINDOW?.trim();
  if (!raw) return 12;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return 12;
  return n;
}
