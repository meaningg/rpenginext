import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema } from "../json.ts";
import { WorldStateSchema } from "../state/world-state.ts";
import { PassageSchema } from "../turn/passage.ts";
import { SESSION_FORMAT_VERSION } from "../version.ts";

export const EnabledModuleRefSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
});

/**
 * Durable pending system turn (specs/02 S19): survives save/load, drains after load.
 */
export const PendingSystemTurnSchema = z.object({
  reason: z.string().min(1),
  payload: JsonObjectSchema.optional(),
  requestedByModuleId: z.string().min(1),
  mode: z.enum(["inline", "background"]).default("inline"),
});

export type PendingSystemTurnSnapshot = z.infer<typeof PendingSystemTurnSchema>;

/**
 * Durable session snapshot (logical).
 * @see docs/architecture/07-persistence.md
 */
export const SessionSnapshotSchema = z.object({
  formatVersion: z.number().int().positive().default(SESSION_FORMAT_VERSION),
  sessionId: IdStringSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  engine: z.object({
    coreVersion: z.string().min(1),
    contractsVersion: z.string().min(1),
  }),
  enabledModules: z.array(EnabledModuleRefSchema),
  state: WorldStateSchema,
  lastPassageId: IdStringSchema.optional(),
  passages: z.array(PassageSchema).optional(),
  idempotency: z.record(z.string(), IdStringSchema).optional(),
  meta: JsonObjectSchema.optional(),
  pendingSystemTurns: z.array(PendingSystemTurnSchema).optional(),
});

export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

export const SessionMetaSchema = z.object({
  sessionId: IdStringSchema,
  updatedAt: z.string().min(1),
  title: z.string().optional(),
  meta: JsonObjectSchema.optional(),
});

export type SessionMeta = z.infer<typeof SessionMetaSchema>;

/**
 * Parses a session snapshot.
 *
 * @param input - raw value
 */
export function parseSessionSnapshot(input: unknown) {
  return SessionSnapshotSchema.safeParse(input);
}
