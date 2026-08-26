import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  err,
  failure,
  moduleFailure,
  ok,
  type Failure,
  type Module,
  type Result,
  type TurnLogger,
} from "@rpengineext/contracts";

/**
 * A resolvable module in the host module pool (catalog ⊕ discovery).
 *
 * Factories are **lazy**: `import()` of the entry happens inside the factory,
 * so unselected modules are never imported (faster boot, smaller error surface).
 *
 * @see docs/adr/0006-local-module-discovery.md
 */
export interface ModulePoolEntry {
  readonly id: string;
  /** Human-readable origin (package.json path / catalog label) for errors. */
  readonly source: string;
  /** Optional hint used in MODULE_UNKNOWN messages. */
  readonly description?: string;
  readonly factory: () => Module | Promise<Module>;
}

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Defaults the module id from the package name:
 * `@rpengineext/module-mood` → `mood`; `@acme/inventory` → `inventory`.
 *
 * @param name - package.json `name`
 */
function defaultIdFromPackageName(name: string): string | undefined {
  const withoutScope = name.replace(/^@[^/]+\//, "");
  const candidate = withoutScope.replace(/^module-/, "");
  return candidate.length > 0 && ID_PATTERN.test(candidate) ? candidate : undefined;
}

function invalid(
  what: string,
  source: string,
  moduleId?: string,
): Failure {
  return failure(
    "CONFIG_INVALID",
    `${what} (${source}). Hint: fix the rpengineext.module declaration in package.json.`,
    {
      ...(moduleId ? { moduleId } : {}),
      details: { source },
    },
  );
}

/**
 * Scans module roots for packages declaring `rpengineext.module` and builds a
 * sorted id pool (ADR 0006 D2–D6).
 *
 * - Package without the field → skipped (debug log).
 * - Field present but invalid → `CONFIG_INVALID` (typos are loud).
 * - Duplicate id across roots/packages → `MODULE_ID_DUPLICATE` with both sources.
 * - Missing root: strict (explicit config) → `CONFIG_INVALID`; default root → warn + skip.
 * - Order: roots in given order; within a root — id lexicographic (stable on any OS).
 *
 * @param roots - scan roots (absolute paths)
 * @param opts - strict (explicitly configured roots) + logger
 */
export async function discoverModulePool(
  roots: readonly string[],
  opts: { readonly strict?: boolean; readonly log: TurnLogger },
): Promise<Result<ModulePoolEntry[], Failure>> {
  const { strict = false, log } = opts;
  const entries: ModulePoolEntry[] = [];
  const seen = new Map<string, string>(); // id → source for duplicate detection

  for (const root of roots) {
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await readdir(root, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        if (strict) {
          return err(
            failure(
              "CONFIG_INVALID",
              `module directory not found: "${root}". Hint: point RP_MODULE_DIRS / moduleDirs at a directory containing rpengineext modules.`,
              { details: { source: root } },
            ),
          );
        }
        log.warn({ dir: root }, `module discovery: default module dir missing — no modules discovered from it`);
        continue;
      }
      return err(
        failure("CONFIG_INVALID", `module directory unreadable: "${root}"`, {
          details: { source: root, error: String(error) },
        }),
      );
    }

    for (const dirent of dirents) {
      if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
      const pkgPath = path.join(root, dirent.name, "package.json");
      let raw: string;
      try {
        raw = await readFile(pkgPath, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue; // not a package — not a candidate
        log.warn({ dir: path.join(root, dirent.name) }, `module discovery: package.json unreadable — skipped`);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        log.warn(
          { source: pkgPath },
          `module discovery: invalid package.json — skipped (cannot read declaration)`,
        );
        continue;
      }
      const decl = (parsed as { rpengineext?: { module?: unknown } }).rpengineext?.module;
      if (decl === undefined) continue; // not a module package

      if (typeof decl !== "object" || decl === null) {
        return err(invalid(`rpengineext.module must be an object`, pkgPath));
      }
      const moduleDecl = decl as { id?: unknown; entry?: unknown; factory?: unknown; description?: unknown };
      const id = moduleDecl.id ?? defaultIdFromPackageName(
        typeof (parsed as { name?: unknown }).name === "string"
          ? (parsed as { name: string }).name
          : "",
      );
      if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        return err(
          invalid(
            `invalid module id "${String(id)}" (kebab-case required)`,
            pkgPath,
          ),
        );
      }
      if (typeof moduleDecl.entry !== "string" || moduleDecl.entry.trim().length === 0) {
        return err(invalid(`rpengineext.module.entry must be a path string`, pkgPath, id));
      }
      if (typeof moduleDecl.factory !== "string" || moduleDecl.factory.trim().length === 0) {
        return err(invalid(`rpengineext.module.factory must be a named export string`, pkgPath, id));
      }
      const description =
        typeof moduleDecl.description === "string" && moduleDecl.description.length > 0
          ? moduleDecl.description
          : undefined;

      const prior = seen.get(id);
      if (prior) {
        return err(
          moduleFailure(
            "MODULE_ID_DUPLICATE",
            `duplicate module id "${id}" in module pool (sources "${prior}" and "${pkgPath}"). Hint: give each module package a unique id.`,
            { moduleId: id, moduleIds: [id], sources: [prior, pkgPath] },
          ),
        );
      }
      seen.set(id, pkgPath);

      const entryAbs = path.resolve(root, dirent.name, moduleDecl.entry);
      entries.push({
        id,
        source: pkgPath,
        ...(description ? { description } : {}),
        factory: async (): Promise<Module> => {
          const imported = (await import(entryAbs)) as Record<string, unknown>;
          const fn = imported[moduleDecl.factory as string];
          if (typeof fn !== "function") {
            throw new Error(
              `module "${id}" entry "${entryAbs}" does not export factory "${moduleDecl.factory as string}"`,
            );
          }
          const mod = (await fn()) as Module | undefined;
          if (!mod || typeof mod !== "object") {
            throw new Error(`module "${id}" factory returned no Module (${entryAbs})`);
          }
          return mod;
        },
      });
    }
  }

  // Deterministic order: id lexicographic (ADR 0006 D5).
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ok(entries);
}

/**
 * Instantiates a list of pool ids in list order (lazy: factories import their
 * entry only when selected). Unknown id → `MODULE_UNKNOWN` with hint;
 * factory/import failure → `CONFIG_INVALID` (ADR 0006 D4).
 *
 * @param ids - pool ids (order preserved)
 * @param pool - merged module pool (catalog ⊕ discovery)
 */
export async function instantiateFromPool(
  ids: readonly string[],
  pool: readonly ModulePoolEntry[],
): Promise<Result<Module[], Failure>> {
  const byId = new Map(pool.map((entry) => [entry.id, entry]));
  const modules: Module[] = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) {
      const known = pool.map((e) => e.id);
      const hint =
        known.length > 0
          ? known.slice(0, 8).join(", ") + (known.length > 8 ? ", …" : "")
          : "(none)";
      return err(
        moduleFailure(
          "MODULE_UNKNOWN",
          `unknown module id "${id}" in host module list (module: ${id}). Hint: known module ids: ${hint}.`,
          { moduleId: id },
        ),
      );
    }
    try {
      modules.push(await entry.factory());
    } catch (error) {
      return err(
        moduleFailure(
          "CONFIG_INVALID",
          `module "${id}" factory failed (source: ${entry.source}). Hint: check the rpengineext.module entry/factory declaration and that the package exports the factory.`,
          { moduleId: id, source: entry.source, details: String(error) },
        ),
      );
    }
  }
  return ok(modules);
}

/**
 * Merges discovered pool entries with the first-party catalog (ADR 0006 D6):
 * catalog wins on id collision (warn; promotion bridge), discovery appends after.
 *
 * @param catalog - blessed first-party catalog
 * @param discovered - discovered entries (id-sorted)
 * @param log - logger
 */
export function resolvePool(
  catalog: readonly ModulePoolEntry[],
  discovered: readonly ModulePoolEntry[],
  log: TurnLogger,
): ModulePoolEntry[] {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const merged: ModulePoolEntry[] = [...catalog];
  for (const entry of discovered) {
    const existing = byId.get(entry.id);
    if (existing) {
      log.warn(
        {
          moduleId: entry.id,
          catalogSource: existing.source,
          discoveredSource: entry.source,
        },
        `module "${entry.id}" discovered but already in the host catalog — catalog entry wins`,
      );
      continue;
    }
    byId.set(entry.id, entry);
    merged.push(entry);
  }
  return merged;
}