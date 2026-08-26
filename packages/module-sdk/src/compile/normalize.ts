import {
  err,
  moduleFailure,
  ok,
  type Failure,
  type JsonObject,
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
 * @typeParam TSlice - author slice type (erased after normalize)
 * @typeParam TConfig - author config type (erased after normalize)
 * @param def - author definition
 */
export function normalizeModuleDefinition<
  TSlice = JsonObject,
  TConfig extends JsonObject = JsonObject,
>(
  def: ModuleDefinition<TSlice, TConfig>,
): Result<NormalizedModuleDefinition, Failure> {
  if (!def.id?.trim()) {
    return err(
      moduleFailure("MODULE_DEFINE_INVALID", "module id is required", {
        field: "id",
      }),
    );
  }
  if (!/^[a-z][a-z0-9-]*$/.test(def.id)) {
    return err(
      moduleFailure(
        "MODULE_DEFINE_INVALID",
        `module id "${def.id}" must be kebab-case ([a-z][a-z0-9-]*)`,
        { field: "id" },
      ),
    );
  }
  if (!def.version?.trim()) {
    return err(
      moduleFailure("MODULE_DEFINE_INVALID", "module version is required", {
        field: "version",
      }),
    );
  }
  if (!def.title?.trim()) {
    return err(
      moduleFailure("MODULE_DEFINE_INVALID", "module title is required", {
        field: "title",
      }),
    );
  }

  const capabilities: Capability[] = [...(def.capabilities ?? [])];

  // Generic author types erase to the closed Capability union at the IR boundary.
  if (def.state) capabilities.push({ kind: "state", ...def.state } as Capability);
  if (def.seed) capabilities.push({ kind: "seed", ...def.seed } as Capability);
  if (def.rules) capabilities.push({ kind: "rules", ...def.rules } as Capability);
  if (def.turn) capabilities.push({ kind: "turn", ...def.turn } as Capability);
  if (def.narrative) {
    capabilities.push({ kind: "narrative", ...def.narrative } as Capability);
  }
  if (def.ai) capabilities.push({ kind: "ai", ...def.ai } as Capability);
  if (def.host) capabilities.push({ kind: "host", ...def.host } as Capability);
  if (def.config) capabilities.push({ kind: "config", ...def.config } as Capability);
  if (def.access) capabilities.push({ kind: "access", ...def.access } as Capability);
  if (def.events) capabilities.push({ kind: "events", ...def.events } as Capability);

  // Event name validation (canonical = moduleId._ + local kebab name; specs/06 §7.3).
  const eventCaps = capabilities.filter((c) => c.kind === "events");
  for (const cap of eventCaps) {
    if (cap.kind !== "events") continue;
    for (const decl of cap.emit ?? []) {
      if (!/^[a-z][a-z0-9-]*$/.test(decl.name)) {
        return err(
          moduleFailure(
            "MODULE_DEFINE_INVALID",
            `module ${def.id}: event emit name "${decl.name}" must be kebab-case`,
            { field: "events.emit", name: decl.name },
          ),
        );
      }
    }
    for (const decl of cap.subscribe ?? []) {
      // Canonical = <moduleId(-→_)>.<local kebab name> — exactly one dot
      // (specs/06 §7.3): validated at define with MODULE_DEFINE_INVALID.
      if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9-]+$/.test(decl.name)) {
        return err(
          moduleFailure(
            "MODULE_DEFINE_INVALID",
            `module ${def.id}: event subscribe name "${decl.name}" must be dot-complete canonical (<moduleId>.<kebab-name>, e.g. "working_memory.window_changed")`,            { field: "events.subscribe", name: decl.name },
          ),
        );
      }
    }
  }

  const stateCaps = capabilities.filter((c) => c.kind === "state");
  if (stateCaps.length > 1) {
    return err(
      moduleFailure(
        "MODULE_DEFINE_INVALID",
        `module ${def.id}: at most one state capability (v1)`,
        { field: "state" },
      ),
    );
  }
  const configCaps = capabilities.filter((c) => c.kind === "config");
  if (configCaps.length > 1) {
    return err(
      moduleFailure(
        "MODULE_DEFINE_INVALID",
        `module ${def.id}: at most one config capability`,
        { field: "config" },
      ),
    );
  }
  const accessCaps = capabilities.filter((c) => c.kind === "access");
  if (accessCaps.length > 1) {
    return err(
      moduleFailure(
        "MODULE_DEFINE_INVALID",
        `module ${def.id}: at most one access capability`,
        { field: "access" },
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
    init: def.init,
    shutdown: def.shutdown,
  });
}