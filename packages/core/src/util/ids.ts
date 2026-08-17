/**
 * Generates opaque runtime identifiers with a stable prefix.
 *
 * @param prefix - short kind prefix (e.g. `ses`, `trn`)
 */
export function createId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}_${uuid}`;
}

/**
 * Creates a session id.
 */
export function createSessionId(): string {
  return createId("ses");
}

/**
 * Creates a turn id.
 */
export function createTurnId(): string {
  return createId("trn");
}

/**
 * Creates a passage id.
 */
export function createPassageId(): string {
  return createId("psg");
}

/**
 * Creates a command id.
 */
export function createCommandId(): string {
  return createId("cmd");
}

/**
 * Creates an agent task id.
 */
export function createTaskId(): string {
  return createId("tsk");
}
