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
] as const;

export type TurnFailureCode = (typeof TURN_FAILURE_CODES)[number];

export const TurnFailureCodeSchema = z.enum(TURN_FAILURE_CODES);

/**
 * Closed set of boot / registry failure codes.
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
] as const;

export type BootFailureCode = (typeof BOOT_FAILURE_CODES)[number];

export const BootFailureCodeSchema = z.enum(BOOT_FAILURE_CODES);
