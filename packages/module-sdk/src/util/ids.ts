/**
 * Converts module id (`world-canon`) to default slice name (`world_canon`).
 *
 * @param moduleId - module manifest id
 */
export function defaultSliceName(moduleId: string): string {
  return moduleId.replace(/-/g, "_");
}

/**
 * Stable command id.
 */
export function createCommandId(): string {
  return `cmd_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Stable agent task id.
 */
export function createTaskId(): string {
  return `tsk_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Builds namespaced command type `slice.op`.
 *
 * @param slice - slice name
 * @param op - op key
 */
export function commandType(slice: string, op: string): string {
  return `${slice}.${op}`;
}

/**
 * Builds namespaced tool/task id from module id + local key.
 *
 * @param moduleId - module id
 * @param key - local key
 */
export function namespacedId(moduleId: string, key: string): string {
  return `${defaultSliceName(moduleId)}.${key}`;
}

/**
 * Reserved turn extras key for deferred ops from tools.
 *
 * @param moduleId - module id
 */
export function pendingOpsExtrasKey(moduleId: string): string {
  return `__sdk_pending_ops__:${moduleId}`;
}
