import {
  err,
  failure,
  ok,
  type Failure,
  type JsonObject,
  type MigrationDefinition,
  type Result,
  type SliceDefinition,
  type WorldState,
} from "@rpengineext/contracts";

import type { Owned } from "../registry/contribution-index.ts";
import { deepClone } from "../util/clone.ts";

/**
 * Applies registered slice migrations until each slice matches its definition schemaVersion.
 * Unknown slices (no definition) are left as-is.
 *
 * @param state - loaded world state
 * @param slices - registered slice definitions
 * @param migrations - registered migrations (any order)
 */
export function applySliceMigrations(
  state: WorldState,
  slices: ReadonlyMap<string, Owned<SliceDefinition>>,
  migrations: readonly Owned<MigrationDefinition>[],
): Result<WorldState, Failure> {
  const nextSlices: Record<string, JsonObject> = {
    ...deepClone(state.slices),
  };

  for (const [name, owned] of slices) {
    const def = owned.value;
    const current = nextSlices[name];
    if (current === undefined) {
      nextSlices[name] = def.initialValue ? deepClone(def.initialValue) : {};
      continue;
    }

    let version = readSchemaVersion(current) ?? 1;
    let payload = deepClone(current);

    while (version < def.schemaVersion) {
      const step = migrations
        .map((item) => item.value)
        .filter(
          (migration) =>
            migration.slice === name && migration.fromVersion === version,
        )
        .sort((a, b) => a.toVersion - b.toVersion)[0];

      if (!step) {
        return err(
          failure(
            "INTERNAL",
            `missing migration for slice "${name}" from v${version} to v${def.schemaVersion}`,
            { details: { slice: name, fromVersion: version } },
          ),
        );
      }
      if (step.toVersion <= version) {
        return err(
          failure(
            "INTERNAL",
            `non-forward migration for slice "${name}" v${version} → v${step.toVersion}`,
          ),
        );
      }

      const migrated = step.migrate(payload);
      if (!migrated.ok) {
        return err(
          failure(
            migrated.error.code || "INTERNAL",
            migrated.error.message || `migration failed for slice ${name}`,
            {
              details: migrated.error.details,
              causedBy: migrated.error.causedBy,
            },
          ),
        );
      }
      payload = migrated.value;
      version = step.toVersion;
      payload = {
        ...payload,
        schemaVersion: version,
      };
    }

    if (version !== def.schemaVersion) {
      return err(
        failure(
          "INTERNAL",
          `slice "${name}" ended at schemaVersion ${version}, expected ${def.schemaVersion}`,
        ),
      );
    }

    const parsed = def.schema.safeParse(payload);
    if (!parsed.success) {
      return err(
        failure(
          "SCHEMA_INVALID",
          `slice "${name}" failed schema after migration`,
          { details: parsed.error.flatten() },
        ),
      );
    }
    nextSlices[name] = parsed.data;
  }

  return ok({
    ...state,
    slices: nextSlices,
  });
}

function readSchemaVersion(slice: JsonObject): number | undefined {
  const raw = slice.schemaVersion;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0
    ? raw
    : undefined;
}
