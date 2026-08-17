import type { JsonObject, JsonValue, WorldState } from "@rpengineext/contracts";

export interface StateDiffEntry {
  readonly path: string;
  readonly before: JsonValue | undefined;
  readonly after: JsonValue | undefined;
}

/**
 * Computes a shallow-path diff between two world states for turn traces.
 *
 * @param before - S0
 * @param after - draft or committed
 */
export function diffWorldState(
  before: WorldState,
  after: WorldState,
): StateDiffEntry[] {
  const entries: StateDiffEntry[] = [];
  walk("meta", before.meta as unknown as JsonValue, after.meta as unknown as JsonValue, entries);
  walk("core", before.core as unknown as JsonValue, after.core as unknown as JsonValue, entries);
  walk(
    "slices",
    before.slices as unknown as JsonValue,
    after.slices as unknown as JsonValue,
    entries,
  );
  return entries;
}

function walk(
  path: string,
  a: JsonValue | undefined,
  b: JsonValue | undefined,
  out: StateDiffEntry[],
): void {
  if (Object.is(a, b)) {
    return;
  }
  const aObj = isPlainObject(a);
  const bObj = isPlainObject(b);
  if (aObj && bObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      walk(`${path}.${key}`, a[key], b[key], out);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return;
    }
    out.push({ path, before: a, after: b });
    return;
  }
  out.push({ path, before: a, after: b });
}

function isPlainObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
