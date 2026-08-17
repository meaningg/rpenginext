import type { JsonObject, JsonValue, WorldState } from "@rpengineext/contracts";

export interface StateDiffEntry {
  readonly path: string;
  readonly before: JsonValue | undefined;
  readonly after: JsonValue | undefined;
}

/**
 * Computes a path-oriented diff between two world states for turn traces.
 *
 * Arrays of objects with stable ids (`turnId` / `id` / `commandId`) are diffed
 * item-wise so traces do not dump the entire history twice.
 *
 * @param before - S0
 * @param after - draft or committed
 */
export function diffWorldState(
  before: WorldState,
  after: WorldState,
): StateDiffEntry[] {
  const entries: StateDiffEntry[] = [];
  walk(
    "meta",
    before.meta as unknown as JsonValue,
    after.meta as unknown as JsonValue,
    entries,
  );
  walk(
    "core",
    before.core as unknown as JsonValue,
    after.core as unknown as JsonValue,
    entries,
  );
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
    diffArrays(path, a, b, out);
    return;
  }
  out.push({ path, before: a, after: b });
}

function diffArrays(
  path: string,
  a: JsonValue[],
  b: JsonValue[],
  out: StateDiffEntry[],
): void {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return;
  }

  const aKeys = a.map(itemKey);
  const bKeys = b.map(itemKey);
  const keyed =
    aKeys.every((k) => k !== null) &&
    bKeys.every((k) => k !== null) &&
    (a.length > 0 || b.length > 0);

  if (keyed) {
    const aMap = new Map<string, JsonValue>();
    const bMap = new Map<string, JsonValue>();
    for (let i = 0; i < a.length; i++) aMap.set(aKeys[i]!, a[i]!);
    for (let i = 0; i < b.length; i++) bMap.set(bKeys[i]!, b[i]!);

    const allKeys = new Set([...aMap.keys(), ...bMap.keys()]);
    let changed = 0;
    for (const key of [...allKeys].sort()) {
      const before = aMap.get(key);
      const after = bMap.get(key);
      if (before === undefined && after !== undefined) {
        out.push({
          path: `${path}[+${key}]`,
          before: undefined,
          after,
        });
        changed += 1;
      } else if (before !== undefined && after === undefined) {
        out.push({
          path: `${path}[-${key}]`,
          before,
          after: undefined,
        });
        changed += 1;
      } else if (
        before !== undefined &&
        after !== undefined &&
        JSON.stringify(before) !== JSON.stringify(after)
      ) {
        out.push({
          path: `${path}[~${key}]`,
          before,
          after,
        });
        changed += 1;
      }
    }
    if (changed === 0) {
      // order-only change — summarize
      out.push({
        path: `${path}(order)`,
        before: { length: a.length },
        after: { length: b.length, note: "order changed" },
      });
    } else {
      out.push({
        path: `${path}(summary)`,
        before: { length: a.length },
        after: { length: b.length, changedItems: changed },
      });
    }
    return;
  }

  // Pure append of tail items
  if (b.length >= a.length) {
    const headEqual = a.every(
      (item, i) => JSON.stringify(item) === JSON.stringify(b[i]),
    );
    if (headEqual) {
      const added = b.slice(a.length);
      out.push({
        path: `${path}(summary)`,
        before: { length: a.length },
        after: { length: b.length, added: added.length },
      });
      if (added.length > 0) {
        out.push({
          path: `${path}[+tail]`,
          before: undefined,
          after: added.length === 1 ? added[0]! : added,
        });
      }
      return;
    }
  }

  // Fallback: lengths + short previews, never full multi-MB dumps
  out.push({
    path: `${path}(summary)`,
    before: {
      length: a.length,
      preview: previewArray(a),
    },
    after: {
      length: b.length,
      preview: previewArray(b),
    },
  });
}

function itemKey(item: JsonValue): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const obj = item as JsonObject;
  for (const k of ["turnId", "id", "commandId"] as const) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function previewArray(arr: JsonValue[]): JsonValue {
  if (arr.length === 0) return [];
  const last = arr[arr.length - 1];
  if (last && typeof last === "object" && !Array.isArray(last)) {
    const o = last as JsonObject;
    const slim: JsonObject = {};
    for (const k of ["turnId", "id", "user", "assistant", "type"]) {
      if (o[k] !== undefined) {
        const v = o[k];
        slim[k] =
          typeof v === "string" && v.length > 80
            ? `${v.slice(0, 80)}…`
            : (v as JsonValue);
      }
    }
    return { last: slim };
  }
  return { last: last as JsonValue };
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
