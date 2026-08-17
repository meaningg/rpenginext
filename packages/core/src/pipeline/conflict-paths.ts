import type { ConflictKeyDefinition, StateCommand } from "@rpengineext/contracts";

/**
 * Returns whether a command participates in a declared conflict key.
 *
 * Matching rules:
 * - slice must equal the key slice;
 * - path `*` / `**` / empty → all commands on that slice;
 * - otherwise any derived write-path of the command must glob-match the key path.
 *
 * @param command - candidate command
 * @param key - registered conflict key
 */
export function commandTouchesConflictKey(
  command: StateCommand,
  key: ConflictKeyDefinition,
): boolean {
  if (command.slice !== key.slice) return false;
  const pattern = key.path.trim();
  if (pattern === "" || pattern === "*" || pattern === "**") return true;

  const paths = collectCommandWritePaths(command);
  return paths.some((path) => globPathMatch(path, pattern));
}

/**
 * Derives likely write paths from a command payload for conflict detection.
 *
 * Conventions supported:
 * - `payload.key` → `flags.<key>` and bare key (core.setFlag style)
 * - `payload.path` → explicit path
 * - `payload.id` → `id.<id>` and bare id
 * - top-level payload keys as shallow field paths
 *
 * @param command - command
 */
export function collectCommandWritePaths(command: StateCommand): string[] {
  const out = new Set<string>();
  const payload = command.payload;

  if (typeof payload.key === "string" && payload.key.length > 0) {
    out.add(payload.key);
    out.add(`flags.${payload.key}`);
  }
  if (typeof payload.path === "string" && payload.path.length > 0) {
    out.add(payload.path);
  }
  if (typeof payload.id === "string" && payload.id.length > 0) {
    out.add(payload.id);
    out.add(`id.${payload.id}`);
  }
  if (typeof payload.entityId === "string" && payload.entityId.length > 0) {
    out.add(payload.entityId);
    out.add(`entities.${payload.entityId}`);
  }

  for (const key of Object.keys(payload)) {
    out.add(key);
  }

  // Always include a slice-root marker so path `*` style keys still group.
  out.add("*");
  return [...out];
}

/**
 * Glob match for dotted paths. `*` = one segment, `**` = any remainder.
 *
 * @param path - concrete path
 * @param pattern - pattern with optional wildcards
 */
export function globPathMatch(path: string, pattern: string): boolean {
  if (pattern === "*" || pattern === "**") return true;
  if (path === pattern) return true;

  const pathParts = path.split(".");
  const patParts = pattern.split(".");

  let pi = 0;
  let ti = 0;
  while (pi < patParts.length && ti < pathParts.length) {
    const p = patParts[pi]!;
    if (p === "**") {
      if (pi === patParts.length - 1) return true;
      const next = patParts[pi + 1]!;
      while (ti < pathParts.length) {
        if (segmentMatch(pathParts[ti]!, next) || next === "*" || next === "**") {
          break;
        }
        ti += 1;
      }
      pi += 1;
      continue;
    }
    if (!segmentMatch(pathParts[ti]!, p)) return false;
    pi += 1;
    ti += 1;
  }

  while (pi < patParts.length && patParts[pi] === "**") pi += 1;
  return pi === patParts.length && ti === pathParts.length;
}

function segmentMatch(value: string, pattern: string): boolean {
  return pattern === "*" || pattern === value;
}
