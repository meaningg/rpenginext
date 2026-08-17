import { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

import { WorkingMemoryPairSchema, type WorkingMemoryPair } from "./pair.ts";

/**
 * Authoritative working-memory slice (unbounded archive).
 */
export const WorkingMemorySliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(WorkingMemoryPairSchema),
  })
  .strict();

export type WorkingMemorySlice = {
  readonly schemaVersion: 1;
  readonly entries: readonly WorkingMemoryPair[];
};

/** Zod root cast for SliceDefinition.schema (JsonObject boundary). */
export const WorkingMemorySliceJsonSchema =
  WorkingMemorySliceSchema as unknown as z.ZodType<JsonObject>;

/**
 * Empty slice seed for new sessions.
 */
export function createEmptyWorkingMemorySlice(): WorkingMemorySlice {
  return {
    schemaVersion: 1,
    entries: [],
  };
}

/**
 * Safely reads the slice from world state (missing → empty).
 *
 * @param raw - slices.working_memory value
 */
export function parseWorkingMemorySlice(raw: unknown): WorkingMemorySlice {
  const parsed = WorkingMemorySliceSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return createEmptyWorkingMemorySlice();
}
