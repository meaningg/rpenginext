import type { JsonObject } from "../json.ts";

/**
 * Turn extras key for deferred module op proposals (tools → propose stage).
 * Foundation protocol — not a free-form bag convention.
 */
export const MODULE_OP_PROPOSALS_EXTRAS_KEY = "rp.moduleOpProposals" as const;

/**
 * Turn extras key prefix for system-turn schedules produced in AfterCommit.
 * Full key: `${MODULE_SYSTEM_SCHEDULES_EXTRAS_PREFIX}${moduleId}`
 */
export const MODULE_SYSTEM_SCHEDULES_EXTRAS_PREFIX =
  "rp.moduleSystemSchedules:" as const;

/**
 * One deferred state op proposed by a module tool/handler before TransitionContributor.
 */
export interface ModuleOpProposal {
  readonly moduleId: string;
  readonly slice: string;
  readonly op: string;
  readonly payload: JsonObject;
  readonly reason: string;
}

/**
 * One system-turn request staged during AfterCommit for SystemTurnScheduler drain.
 */
export interface ModuleSystemScheduleProposal {
  readonly reason: string;
  readonly payload?: JsonObject;
  readonly mode?: "inline" | "background";
}

/**
 * Enqueues a deferred op proposal into turn extras.
 *
 * @param extras - turn extras bag
 * @param proposal - op proposal
 */
export function enqueueModuleOpProposal(
  extras: Record<string, unknown>,
  proposal: ModuleOpProposal,
): void {
  const prev = extras[MODULE_OP_PROPOSALS_EXTRAS_KEY];
  const list = Array.isArray(prev) ? (prev as ModuleOpProposal[]) : [];
  extras[MODULE_OP_PROPOSALS_EXTRAS_KEY] = [...list, proposal];
}

/**
 * Takes and removes op proposals for a module (or all if moduleId omitted).
 *
 * @param extras - turn extras bag
 * @param moduleId - optional filter
 */
export function takeModuleOpProposals(
  extras: Record<string, unknown>,
  moduleId?: string,
): ModuleOpProposal[] {
  const prev = extras[MODULE_OP_PROPOSALS_EXTRAS_KEY];
  if (!Array.isArray(prev)) return [];
  const all = prev as ModuleOpProposal[];
  if (!moduleId) {
    delete extras[MODULE_OP_PROPOSALS_EXTRAS_KEY];
    return all;
  }
  const mine = all.filter((p) => p.moduleId === moduleId);
  const rest = all.filter((p) => p.moduleId !== moduleId);
  if (rest.length === 0) delete extras[MODULE_OP_PROPOSALS_EXTRAS_KEY];
  else extras[MODULE_OP_PROPOSALS_EXTRAS_KEY] = rest;
  return mine;
}

/**
 * Stores system schedule proposals for a module (AfterCommit → Scheduler).
 *
 * @param extras - turn extras
 * @param moduleId - module id
 * @param requests - schedules
 */
export function setModuleSystemSchedules(
  extras: Record<string, unknown>,
  moduleId: string,
  requests: readonly ModuleSystemScheduleProposal[],
): void {
  const key = `${MODULE_SYSTEM_SCHEDULES_EXTRAS_PREFIX}${moduleId}`;
  if (requests.length === 0) {
    delete extras[key];
    return;
  }
  extras[key] = [...requests];
}

/**
 * Takes system schedule proposals for a module.
 *
 * @param extras - turn extras
 * @param moduleId - module id
 */
export function takeModuleSystemSchedules(
  extras: Record<string, unknown>,
  moduleId: string,
): ModuleSystemScheduleProposal[] {
  const key = `${MODULE_SYSTEM_SCHEDULES_EXTRAS_PREFIX}${moduleId}`;
  const raw = extras[key];
  delete extras[key];
  if (!Array.isArray(raw)) return [];
  return raw as ModuleSystemScheduleProposal[];
}
