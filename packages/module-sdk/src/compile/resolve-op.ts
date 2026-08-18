import type { SliceOpDef } from "../types/capabilities.ts";

export interface ResolvedOp {
  readonly apply: (slice: unknown, payload: unknown) => unknown;
  readonly payloadSchema?: {
    safeParse(v: unknown): {
      success: boolean;
      data?: unknown;
      error?: unknown;
    };
  };
}

/**
 * Normalizes op def to apply + optional payload schema.
 */
export function resolveOp(def: SliceOpDef<any, any>): ResolvedOp {
  if (typeof def === "function") {
    return { apply: def as (s: unknown, p: unknown) => unknown };
  }
  return {
    apply: def.apply as (s: unknown, p: unknown) => unknown,
    payloadSchema: def.payload as ResolvedOp["payloadSchema"],
  };
}
