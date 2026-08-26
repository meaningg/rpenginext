import { err, moduleFailure, ok, type Failure, type Result } from "@rpengineext/contracts";
import { createCharacterModule } from "@rpengineext/module-character";
import { createSummaryModule } from "@rpengineext/module-summary";
import { createWorldCanonModule } from "@rpengineext/module-world-canon";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";

import type { ModulePoolEntry } from "./module-discovery.ts";

/**
 * First-party in-process factory catalog (specs/04 §4.3) — the blessed part of
 * the module pool. Discovery (ADR 0006) extends the pool; catalog wins on id
 * collision. Unknown id → boot fail `MODULE_UNKNOWN` with hint.
 */
export const MODULE_CATALOG: readonly ModulePoolEntry[] = [
  {
    id: "working-memory",
    source: "host-bootstrap:module-catalog",
    factory: () => createWorkingMemoryModule(),
  },
  {
    id: "world-canon",
    source: "host-bootstrap:module-catalog",
    factory: () => createWorldCanonModule(),
  },
  {
    id: "character",
    source: "host-bootstrap:module-catalog",
    factory: () => createCharacterModule(),
  },
  {
    id: "summary",
    source: "host-bootstrap:module-catalog",
    factory: () => createSummaryModule(),
  },
];

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
 * Merges base + enabled lists **strictly** (specs/04 §4.1.1 locked decision):
 * a duplicate id after merge is a boot failure `MODULE_ID_DUPLICATE` — never
 * a silent dedupe. Order of first occurrence is preserved.
 *
 * @param baseIds - profile / env-derived module ids (list order)
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