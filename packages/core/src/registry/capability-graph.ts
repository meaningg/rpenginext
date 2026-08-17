import {
  CORE_STATE_CAPABILITY,
  err,
  failure,
  ok,
  type Failure,
  type ModuleManifest,
  type Result,
} from "@rpengineext/contracts";

export interface CapabilityGraphResult {
  readonly provided: ReadonlySet<string>;
  readonly order: readonly string[];
}

/**
 * Validates provides/requires and returns deterministic module order.
 *
 * @param manifests - module manifests already sorted candidates
 * @param extraProvides - capabilities provided by core
 */
export function validateCapabilityGraph(
  manifests: readonly ModuleManifest[],
  extraProvides: readonly string[] = [CORE_STATE_CAPABILITY],
): Result<CapabilityGraphResult, Failure> {
  const provided = new Set<string>(extraProvides);
  for (const manifest of manifests) {
    for (const cap of manifest.provides) {
      provided.add(cap);
    }
  }

  for (const manifest of manifests) {
    for (const req of manifest.requires) {
      if (!provided.has(req)) {
        return err(
          failure(
            "CAPABILITY_MISSING",
            `module "${manifest.id}" requires missing capability "${req}"`,
            { causedBy: [manifest.id] },
          ),
        );
      }
    }
  }

  // Hard dependency edges from requires that match another module's provides.
  const moduleProvides = new Map<string, string[]>();
  for (const manifest of manifests) {
    moduleProvides.set(manifest.id, [...manifest.provides]);
  }

  const edges = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    if (!edges.has(manifest.id)) {
      edges.set(manifest.id, new Set());
    }
    for (const req of manifest.requires) {
      for (const [otherId, caps] of moduleProvides) {
        if (otherId === manifest.id) continue;
        if (caps.includes(req)) {
          edges.get(manifest.id)!.add(otherId);
        }
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleCheck = (id: string): Result<void, Failure> => {
    if (visited.has(id)) return ok(undefined);
    if (visiting.has(id)) {
      return err(
        failure("CAPABILITY_CYCLE", `capability dependency cycle at ${id}`),
      );
    }
    visiting.add(id);
    for (const dep of edges.get(id) ?? []) {
      const nested = cycleCheck(dep);
      if (!nested.ok) return nested;
    }
    visiting.delete(id);
    visited.add(id);
    return ok(undefined);
  };

  for (const manifest of manifests) {
    const check = cycleCheck(manifest.id);
    if (!check.ok) return check;
  }

  const order = [...manifests]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id.localeCompare(b.id);
    })
    .map((m) => m.id);

  return ok({ provided, order });
}
