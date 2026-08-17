import { z } from "zod";

import { JsonObjectSchema, type JsonObject } from "../json.ts";
import { IdStringSchema } from "../ids.ts";

/**
 * Core-owned slice of world state (technical meta only).
 */
export interface CoreStateSlice {
  readonly turnIndex: number;
  readonly revision: number;
  readonly clock: string;
  readonly flags: Readonly<Record<string, boolean | string | number>>;
  readonly passageCursor: string | null;
}

export const CoreStateSliceSchema = z.object({
  turnIndex: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  clock: z.string().min(1),
  flags: z.record(
    z.string(),
    z.union([z.boolean(), z.string(), z.number().finite()]),
  ),
  passageCursor: z.string().min(1).nullable(),
});

/**
 * Authoritative world snapshot at a point in time.
 * Module slices are opaque to core beyond schema registration.
 */
export interface WorldState {
  readonly meta: {
    readonly schemaVersion: number;
    readonly revision: number;
    readonly updatedAtTurnId: string | null;
  };
  readonly core: CoreStateSlice;
  readonly slices: Readonly<Record<string, JsonObject>>;
}

export const WorldStateSchema = z.object({
  meta: z.object({
    schemaVersion: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    updatedAtTurnId: IdStringSchema.nullable(),
  }),
  core: CoreStateSliceSchema,
  slices: z.record(z.string(), JsonObjectSchema),
});

export type WorldStateParsed = z.infer<typeof WorldStateSchema>;

/**
 * Creates an empty world state suitable for a new session bootstrap.
 *
 * @param clock - ISO-8601 timestamp
 * @param schemaVersion - world meta schema version
 */
export function createEmptyWorldState(
  clock: string,
  schemaVersion = 1,
): WorldState {
  return {
    meta: {
      schemaVersion,
      revision: 0,
      updatedAtTurnId: null,
    },
    core: {
      turnIndex: 0,
      revision: 0,
      clock,
      flags: {},
      passageCursor: null,
    },
    slices: {},
  };
}
