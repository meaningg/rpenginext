import { z } from "zod";

/**
 * Closed permission vocabulary patterns (v1).
 * Concrete tokens may include a suffix after the last `:`.
 * @see docs/architecture/03-module-system.md
 */
export const PERMISSION_BASE_TOKENS = [
  "state:read",
  "state:propose:*",
  "canon:read",
  "canon:propose",
  "memory:read",
  "memory:write",
  "agent:call:*",
  "rng:use",
] as const;

/**
 * Permission token string. Examples:
 * - `state:read`
 * - `state:propose:npc`
 * - `agent:call:narrative.write`
 */
export type PermissionToken = string;

const PERMISSION_PATTERN =
  /^(state:read|state:propose:\*|state:propose:[a-z][a-z0-9_-]*|canon:read|canon:propose|memory:read|memory:write|agent:call:\*|agent:call:[a-z][a-z0-9_.-]*|rng:use)$/i;

export const PermissionTokenSchema = z
  .string()
  .min(1)
  .regex(PERMISSION_PATTERN, "unknown or malformed permission token");

/**
 * Returns whether a string is a valid v1 permission token.
 *
 * @param value - candidate token
 */
export function isPermissionToken(value: unknown): value is PermissionToken {
  return PermissionTokenSchema.safeParse(value).success;
}

/**
 * Checks whether a granted permission covers a required permission.
 * Wildcards: `state:propose:*`, `agent:call:*`.
 *
 * @param granted - permission held by the module
 * @param required - permission needed for an action
 */
export function permissionCovers(
  granted: PermissionToken,
  required: PermissionToken,
): boolean {
  if (granted === required) {
    return true;
  }
  if (granted === "state:propose:*" && required.startsWith("state:propose:")) {
    return true;
  }
  if (granted === "agent:call:*" && required.startsWith("agent:call:")) {
    return true;
  }
  return false;
}

/**
 * Returns true if any granted token covers the required token.
 *
 * @param granted - module permission set
 * @param required - needed permission
 */
export function hasPermission(
  granted: readonly PermissionToken[],
  required: PermissionToken,
): boolean {
  return granted.some((token) => permissionCovers(token, required));
}

/**
 * Runtime checker injected into {@link import("../turn/context.ts").TurnContext}.
 */
export interface PermissionChecker {
  /**
   * @param token - required permission
   */
  allows(token: PermissionToken): boolean;

  /**
   * All effective tokens for the current module scope.
   */
  list(): readonly PermissionToken[];
}

/**
 * Creates a pure {@link PermissionChecker} from a static grant list.
 *
 * @param granted - tokens declared on the module manifest
 */
export function createPermissionChecker(
  granted: readonly PermissionToken[],
): PermissionChecker {
  const frozen = Object.freeze([...granted]);
  return {
    allows(token: PermissionToken): boolean {
      return hasPermission(frozen, token);
    },
    list(): readonly PermissionToken[] {
      return frozen;
    },
  };
}

/**
 * Builds the propose permission for a slice name.
 *
 * @param slice - state slice id
 */
export function proposePermissionForSlice(slice: string): PermissionToken {
  return `state:propose:${slice}`;
}

/**
 * Builds the agent call permission for a task type.
 *
 * @param taskType - agent task type id
 */
export function agentCallPermission(taskType: string): PermissionToken {
  return `agent:call:${taskType}`;
}
