import {
  CORE_COMMAND_TYPES,
  err,
  failure,
  ok,
  type CommandDefinition,
  type JsonObject,
  type Result,
  type StateCommand,
  type WorldState,
  type Failure,
} from "@rpengineext/contracts";
import { z } from "zod";

const EmptyPayloadSchema = z.object({}).passthrough() as z.ZodType<JsonObject>;

const SetFlagPayloadSchema = z
  .object({
    key: z.string().min(1),
    value: z.union([z.boolean(), z.string(), z.number().finite()]),
  })
  .strict() as unknown as z.ZodType<JsonObject>;

const ClearFlagPayloadSchema = z
  .object({
    key: z.string().min(1),
  })
  .strict() as unknown as z.ZodType<JsonObject>;

const SetClockPayloadSchema = z
  .object({
    clock: z.string().min(1),
  })
  .strict() as unknown as z.ZodType<JsonObject>;

const SetPassageCursorPayloadSchema = z
  .object({
    cursor: z.string().min(1).nullable(),
  })
  .strict() as unknown as z.ZodType<JsonObject>;

const BumpTurnPayloadSchema = z
  .object({
    turnId: z.string().min(1).optional(),
  })
  .passthrough() as unknown as z.ZodType<JsonObject>;

function withCore(
  state: WorldState,
  core: WorldState["core"],
  metaPatch?: Partial<WorldState["meta"]>,
): WorldState {
  return {
    meta: {
      ...state.meta,
      revision: core.revision,
      ...metaPatch,
    },
    core,
    slices: state.slices,
  };
}

/**
 * Built-in core command definitions registered at engine boot.
 */
export function createCoreCommandDefinitions(): CommandDefinition[] {
  return [
    {
      type: CORE_COMMAND_TYPES.bumpTurn,
      slice: "core",
      payloadSchema: BumpTurnPayloadSchema,
      apply(state, command): Result<WorldState, Failure> {
        const turnId =
          typeof command.payload.turnId === "string"
            ? command.payload.turnId
            : state.meta.updatedAtTurnId;
        const nextRevision = state.core.revision + 1;
        const core = {
          ...state.core,
          turnIndex: state.core.turnIndex + 1,
          revision: nextRevision,
        };
        return ok(
          withCore(state, core, {
            revision: nextRevision,
            updatedAtTurnId: turnId,
          }),
        );
      },
    },
    {
      type: CORE_COMMAND_TYPES.setFlag,
      slice: "core",
      payloadSchema: SetFlagPayloadSchema,
      apply(state, command): Result<WorldState, Failure> {
        const key = String(command.payload.key);
        const value = command.payload.value as boolean | string | number;
        return ok(
          withCore(state, {
            ...state.core,
            flags: { ...state.core.flags, [key]: value },
          }),
        );
      },
    },
    {
      type: CORE_COMMAND_TYPES.clearFlag,
      slice: "core",
      payloadSchema: ClearFlagPayloadSchema,
      apply(state, command): Result<WorldState, Failure> {
        const key = String(command.payload.key);
        const { [key]: _removed, ...rest } = state.core.flags;
        return ok(
          withCore(state, {
            ...state.core,
            flags: rest,
          }),
        );
      },
    },
    {
      type: CORE_COMMAND_TYPES.setClock,
      slice: "core",
      payloadSchema: SetClockPayloadSchema,
      apply(state, command): Result<WorldState, Failure> {
        return ok(
          withCore(state, {
            ...state.core,
            clock: String(command.payload.clock),
          }),
        );
      },
    },
    {
      type: CORE_COMMAND_TYPES.setPassageCursor,
      slice: "core",
      payloadSchema: SetPassageCursorPayloadSchema,
      apply(state, command): Result<WorldState, Failure> {
        const cursor = command.payload.cursor;
        return ok(
          withCore(state, {
            ...state.core,
            passageCursor:
              cursor === null || cursor === undefined ? null : String(cursor),
          }),
        );
      },
    },
  ];
}

/**
 * Validates a command payload against its definition schema.
 *
 * @param def - command definition
 * @param command - candidate command
 */
export function validateCommandPayload(
  def: CommandDefinition,
  command: StateCommand,
): Result<void, Failure> {
  const parsed = def.payloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return err(
      failure("COMMAND_INVALID", `invalid payload for ${command.type}`, {
        details: parsed.error.flatten(),
      }),
    );
  }
  return ok(undefined);
}

// silence unused in some tooling paths
void EmptyPayloadSchema;
