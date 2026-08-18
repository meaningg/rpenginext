import {
  err,
  failure,
  ok,
  type Failure,
  type Result,
} from "@rpengineext/contracts";

import type { Capability } from "../types/capabilities.ts";
import type {
  ModuleDefinition,
  NormalizedModuleDefinition,
} from "../types/definition.ts";

/**
 * Expands object sugar into capabilities and validates cardinality rules.
 *
 * @param def - author definition
 */
export function normalizeModuleDefinition(
  def: ModuleDefinition,
): Result<NormalizedModuleDefinition, Failure> {
  if (!def.id?.trim()) {
    return err(failure("SCHEMA_INVALID", "module id is required"));
  }
  if (!def.version?.trim()) {
    return err(failure("SCHEMA_INVALID", "module version is required"));
  }
  if (!def.title?.trim()) {
    return err(failure("SCHEMA_INVALID", "module title is required"));
  }

  const capabilities: Capability[] = [...(def.capabilities ?? [])];

  if (def.state) capabilities.push({ kind: "state", ...def.state });
  if (def.seed) capabilities.push({ kind: "seed", ...def.seed });
  if (def.rules) capabilities.push({ kind: "rules", ...def.rules });
  if (def.turn) capabilities.push({ kind: "turn", ...def.turn });
  if (def.narrative) capabilities.push({ kind: "narrative", ...def.narrative });
  if (def.ai) capabilities.push({ kind: "ai", ...def.ai });
  if (def.host) capabilities.push({ kind: "host", ...def.host });
  if (def.config) capabilities.push({ kind: "config", ...def.config });
  if (def.access) capabilities.push({ kind: "access", ...def.access });

  const stateCaps = capabilities.filter((c) => c.kind === "state");
  if (stateCaps.length > 1) {
    return err(
      failure(
        "SCHEMA_INVALID",
        `module ${def.id}: at most one state capability (v1)`,
      ),
    );
  }
  const configCaps = capabilities.filter((c) => c.kind === "config");
  if (configCaps.length > 1) {
    return err(
      failure(
        "SCHEMA_INVALID",
        `module ${def.id}: at most one config capability`,
      ),
    );
  }
  const accessCaps = capabilities.filter((c) => c.kind === "access");
  if (accessCaps.length > 1) {
    return err(
      failure(
        "SCHEMA_INVALID",
        `module ${def.id}: at most one access capability`,
      ),
    );
  }

  return ok({
    id: def.id,
    version: def.version,
    title: def.title,
    description: def.description ?? "",
    priority: def.priority ?? 100,
    provides: def.provides ?? [],
    requires: def.requires ?? ["capability:state-core"],
    capabilities,
  });
}
