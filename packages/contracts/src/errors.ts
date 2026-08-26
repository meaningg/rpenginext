import { z } from "zod";

/**
 * Closed set of turn-level failure codes (normative v1).
 * @see docs/architecture/04-state-and-commands.md
 */
export const TURN_FAILURE_CODES = [
  "GUARD_REJECTED",
  "INVALID_INPUT",
  "COMMAND_INVALID",
  "COMMAND_CONFLICT",
  "AGENT_FAILED",
  "TIMEOUT",
  "INTERNAL",
  "PERMISSION_DENIED",
  "INVARIANT_FAILED",
  "PRESENT_FAILED",
  "PERSISTENCE_FAILED",
  "AMBIGUOUS_TARGET",
  "MODULE_ERROR",
  // Module-platform codes that may surface as turn failures (specs/03-author-errors.md).
  // These preserve the stable author-facing `code` end-to-end.
  "MODULE_OP_UNKNOWN",
  "MODULE_OP_PAYLOAD_INVALID",
  "MODULE_READ_MODEL_UNKNOWN",
  "MODULE_READ_MODEL_ARGS_INVALID",
  "MODULE_MOMENT_OP_FORBIDDEN",
  "MODULE_EVENT_UNKNOWN",
  "MODULE_EVENT_PAYLOAD_INVALID",
  "MODULE_EVENT_EMIT_FORBIDDEN",
  "MODULE_EVENT_DENY_FORBIDDEN",
  "MODULE_EVENT_CASCADE_LIMIT",
  "MODULE_EVENT_BURST_LIMIT",
] as const;

export type TurnFailureCode = (typeof TURN_FAILURE_CODES)[number];

export const TurnFailureCodeSchema = z.enum(TURN_FAILURE_CODES);

/**
 * Closed set of boot / registry failure codes (normative v1).
 */
export const BOOT_FAILURE_CODES = [
  "MANIFEST_INVALID",
  "ENGINE_MISMATCH",
  "CAPABILITY_MISSING",
  "CAPABILITY_CYCLE",
  "PERMISSION_UNKNOWN",
  "DUPLICATE_MODULE",
  "REGISTRATION_INVALID",
  "CONFIG_INVALID",
  // Module-platform codes (specs/03-author-errors.md).
  "MODULE_DEFINE_INVALID",
  "MODULE_IR_BIND_MISMATCH",
  "MODULE_ID_DUPLICATE",
  "MODULE_SLICE_DUPLICATE",
  "MODULE_REQUIRES_MISSING",
  "MODULE_CAPABILITY_INVALID",
  "MODULE_ENGINES_INCOMPATIBLE",
  "MODULE_UNKNOWN",
  "MODULE_EVENT_DUPLICATE",
  "MODULE_EVENT_UNKNOWN",
  "MODULE_INIT_FAILED",
] as const;

export type BootFailureCode = (typeof BOOT_FAILURE_CODES)[number];

export const BootFailureCodeSchema = z.enum(BOOT_FAILURE_CODES);

/**
 * Single source of author-facing module failure codes (normative catalog).
 *
 * IDs E01–E26 map 1:1 to `docs/modules/errors.md`:
 *
 * | Code | E# | When |
 * |------|----|------|
 * | `MODULE_DEFINE_INVALID` | E01 | defineModule/normalize invalid |
 * | `MODULE_OP_UNKNOWN` | E02 | unknown `ctx.op` name |
 * | `MODULE_IR_BIND_MISMATCH` | E03 | IR/binding structural mismatch |
 * | `MODULE_ID_DUPLICATE` | E04 | duplicate module id |
 * | `MODULE_SLICE_DUPLICATE` | E05 | duplicate slice name |
 * | `MODULE_REQUIRES_MISSING` | E06 | unsatisfied requires |
 * | `CONFIG_INVALID` | E07 | moduleConfig schema fail |
 * | `MODULE_PERMISSION_DENIED` | E08 | propose/agent without permission |
 * | `SCHEMA_INVALID` | E09 | seed meta parse fail |
 * | `MODULE_READ_MODEL_UNKNOWN` | E10 | readModel name missing |
 * | `MODULE_ENGINES_INCOMPATIBLE` | E11 | engines.core/contracts unsupported |
 * | `MODULE_UNKNOWN` | E12 | host catalog unknown id |
 * | `MODULE_OP_PAYLOAD_INVALID` | E13 | op payload schema fail |
 * | `MODULE_SLICE_UNMIGRATABLE` | E14 | unmigratable slice version |
 * | `MODULE_MOMENT_OP_FORBIDDEN` | E15 | op/mutate in write-forbidden moment |
 * | `MODULE_EVENT_DUPLICATE` | E16 | duplicate publisher of same canonical event name |
 * | `MODULE_EVENT_UNKNOWN` | E17 | emit/subscription to unknown event name |
 * | `MODULE_EVENT_PAYLOAD_INVALID` | E18 | emit payload fails declared schema |
 * | `MODULE_EVENT_EMIT_FORBIDDEN` | E19 | `ctx.emit` in a moment that forbids emission |
 * | `MODULE_EVENT_DENY_FORBIDDEN` | E20 | `deny()` inside event dispatch |
 * | `MODULE_EVENT_HANDLER_ERROR` | E21 | subscriber handler threw (post-commit → warning) |
 * | `MODULE_EVENT_CASCADE_LIMIT` | E22 | event cascade depth cap breached |
 * | `MODULE_EVENT_BURST_LIMIT` | E23 | per-turn event burst cap breached |
 * | `MODULE_INIT_FAILED` | E24 | module `init` hook failed (boot failure) |
 * | `MODULE_SHUTDOWN_ERROR` | E25 | module `shutdown` hook error (warning) |
 * | `MODULE_READ_MODEL_ARGS_INVALID` | E26 | readModel args fail provider schema |
 */
export const MODULE_FAILURE_CODES = [
  "MODULE_DEFINE_INVALID",
  "MODULE_OP_UNKNOWN",
  "MODULE_IR_BIND_MISMATCH",
  "MODULE_ID_DUPLICATE",
  "MODULE_SLICE_DUPLICATE",
  "MODULE_REQUIRES_MISSING",
  "MODULE_PERMISSION_DENIED",
  "MODULE_READ_MODEL_UNKNOWN",
  "MODULE_ENGINES_INCOMPATIBLE",
  "MODULE_UNKNOWN",
  "MODULE_OP_PAYLOAD_INVALID",
  "MODULE_SLICE_UNMIGRATABLE",
  "MODULE_MOMENT_OP_FORBIDDEN",
  "MODULE_EVENT_DUPLICATE",
  "MODULE_EVENT_UNKNOWN",
  "MODULE_EVENT_PAYLOAD_INVALID",
  "MODULE_EVENT_EMIT_FORBIDDEN",
  "MODULE_EVENT_DENY_FORBIDDEN",
  "MODULE_EVENT_HANDLER_ERROR",
  "MODULE_EVENT_CASCADE_LIMIT",
  "MODULE_EVENT_BURST_LIMIT",
  "MODULE_INIT_FAILED",
  "MODULE_SHUTDOWN_ERROR",
  "MODULE_READ_MODEL_ARGS_INVALID",
  "MODULE_CAPABILITY_INVALID",
] as const;

export type ModuleFailureCode = (typeof MODULE_FAILURE_CODES)[number];

export const ModuleFailureCodeSchema = z.enum(MODULE_FAILURE_CODES);

/**
 * Event dispatch caps (normative — specs/06 §7.3, specs/02 S22).
 * Breach → `MODULE_EVENT_CASCADE_LIMIT` / `MODULE_EVENT_BURST_LIMIT`.
 */
export const MODULE_EVENT_MAX_CASCADE_DEPTH = 8 as const;

/** Max events dispatched in one turn (all cascades combined). */
export const MODULE_EVENT_MAX_BURST_PER_TURN = 256 as const;