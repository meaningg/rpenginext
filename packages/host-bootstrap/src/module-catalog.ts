import {
  err,
  moduleFailure,
  ok,
  type Failure,
  type Module,
  type Result,
} from "@rpengineext/contracts";
import { createCharacterModule } from "@rpengineext/module-character";
import { createSummaryModule } from "@rpengineext/module-summary";
import { createWorldCanonModule } from "@rpengineext/module-world-canon";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";

/**
 * First-party in-process factory catalog (specs/04 §4.3).
 * Unknown id → boot fail `MODULE_UNKNOWN` with hint.
 */
export interface ModuleFactoryEntry {
  readonly id: string;
  readonly factory: () => Module;
}

export const MODULE_CATALOG: readonly ModuleFactoryEntry[] = [
  { id: "working-memory", factory: () => createWorkingMemoryModule() },
  { id: "world-canon", factory: () => createWorldCanonModule() },
  { id: "character", factory: () => createCharacterModule() },
  { id: "summary", factory: () => createSummaryModule() },
];

const CATALOG_BY_ID = new Map(MODULE_CATALOG.map((entry) => [entry.id, entry]));

/**
 * Module profiles (specs/04 §4.2 — normative).
 */
export type ModuleProfileId = "core-book" | "minimal" | "none";

export const MODULE_PROFILES: Readonly<Record<ModuleProfileId, readonly string[]>> = {
  "core-book": ["working-memory", "world-canon", "character"],
  minimal: ["working-memory"],
  none: [],
};

export const MODULE_PROFILE_IDS = Object.keys(MODULE_PROFILES) as ModuleProfileId[];

/**
 * Expands a profile id into first-party ids.
 *
 * @param profile - profile id
 */
export function expandProfile(profile: ModuleProfileId): readonly string[] {
  return [...(MODULE_PROFILES[profile] ?? [])];
}

/**
 * Instantiates a list of catalog ids in list order.
 *
 * @param ids - catalog ids (order preserved)
 */
export function instantiateFromCatalog(
  ids: readonly string[],
): Result<Module[], Failure> {
  const modules: Module[] = [];
  for (const id of ids) {
    const entry = CATALOG_BY_ID.get(id);
    if (!entry) {
      const known = [...CATALOG_BY_ID.keys()];
      const hint =
        known.length > 0
          ? known.slice(0, 8).join(", ") + (known.length > 8 ? ", …" : "")
          : "(none)";
      return err(
        moduleFailure(
          "MODULE_UNKNOWN",
          `unknown module id "${id}" in host module list (module: ${id}). Hint: known catalog ids: ${hint}.`,
          { moduleId: id },
        ),
      );
    }
    modules.push(entry.factory());
  }
  return ok(modules);
}

/**
 * Merges base + enabled lists **strictly** (specs/04 §4.1.1 locked decision):
 * a duplicate id after merge is a boot failure `MODULE_ID_DUPLICATE` — never
 * a silent dedupe. Order of first occurrence is preserved.
 *
 * @param baseIds - profile / env-derived first-party ids (list order)
 * @param enabledIds - `enabledModuleIds` additions
 */
export function resolveMergedIds(
  baseIds: readonly string[],
  enabledIds: readonly string[],
): Result<string[], Failure> {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const out: string[] = [];
  for (const id of [...baseIds, ...enabledIds]) {
    if (seen.has(id)) {
      if (!duplicates.includes(id)) duplicates.push(id);
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  if (duplicates.length > 0) {
    return err(
      moduleFailure(
        "MODULE_ID_DUPLICATE",
        `duplicate module id(s) "${duplicates.join(", ")}" in resolved host module list (module: ${duplicates[0]}). Hint: list each module id exactly once in RP_MODULES / enabledModuleIds.`,
        { moduleIds: duplicates },
      ),
    );
  }
  return ok(out);
}

export { createWorkingMemoryModule, createWorldCanonModule, createCharacterModule, createSummaryModule };