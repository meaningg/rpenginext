import { z } from "zod";

import { IdStringSchema } from "../ids.ts";
import { JsonObjectSchema, type JsonObject } from "../json.ts";

/**
 * Who proposed a state command into the turn draft.
 */
export const CommandSourceKindSchema = z.enum([
  "module",
  "agent",
  "core",
  "system",
]);

export type CommandSourceKind = z.infer<typeof CommandSourceKindSchema>;

export const CommandSourceSchema = z.object({
  kind: CommandSourceKindSchema,
  id: z.string().min(1),
});

export type CommandSource = z.infer<typeof CommandSourceSchema>;

/**
 * Sole legal mutation unit for world state.
 * @see docs/architecture/04-state-and-commands.md
 */
export interface StateCommand {
  readonly commandId: string;
  readonly type: string;
  readonly slice: string;
  readonly payload: JsonObject;
  readonly reason?: string;
  readonly source: CommandSource;
}

export const StateCommandSchema = z.object({
  commandId: IdStringSchema,
  type: z
    .string()
    .min(1)
    .regex(
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i,
      "command type must be namespaced (e.g. core.setFlag)",
    ),
  slice: z.string().min(1),
  payload: JsonObjectSchema,
  reason: z.string().optional(),
  source: CommandSourceSchema,
});

export type StateCommandParsed = z.infer<typeof StateCommandSchema>;

/**
 * Parses unknown input as {@link StateCommand}.
 *
 * @param input - raw value
 */
export function parseStateCommand(input: unknown) {
  return StateCommandSchema.safeParse(input);
}

/**
 * Reserved core command type prefixes.
 */
export const CORE_COMMAND_TYPES = {
  bumpTurn: "core.bumpTurn",
  setFlag: "core.setFlag",
  clearFlag: "core.clearFlag",
  setPassageCursor: "core.setPassageCursor",
  setClock: "core.setClock",
} as const;

export type CoreCommandType =
  (typeof CORE_COMMAND_TYPES)[keyof typeof CORE_COMMAND_TYPES];
