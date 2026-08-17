import { z } from "zod";

/**
 * Opaque branded identifiers used across session / turn / command boundaries.
 * Runtime values are plain strings; brand is compile-time only.
 */
export type SessionId = string & { readonly __brand: "SessionId" };
export type TurnId = string & { readonly __brand: "TurnId" };
export type PassageId = string & { readonly __brand: "PassageId" };
export type CommandId = string & { readonly __brand: "CommandId" };
export type TaskId = string & { readonly __brand: "TaskId" };
export type ModuleId = string & { readonly __brand: "ModuleId" };
export type ProposalId = string & { readonly __brand: "ProposalId" };
export type ClientActionId = string & { readonly __brand: "ClientActionId" };

const nonEmptyId = z.string().min(1);

/** Zod schema for a non-empty id string (unbranded parse). */
export const IdStringSchema = nonEmptyId;

/**
 * Brands a validated non-empty string as {@link SessionId}.
 *
 * @param value - raw id
 */
export function asSessionId(value: string): SessionId {
  return nonEmptyId.parse(value) as SessionId;
}

/**
 * Brands a validated non-empty string as {@link TurnId}.
 *
 * @param value - raw id
 */
export function asTurnId(value: string): TurnId {
  return nonEmptyId.parse(value) as TurnId;
}

/**
 * Brands a validated non-empty string as {@link PassageId}.
 *
 * @param value - raw id
 */
export function asPassageId(value: string): PassageId {
  return nonEmptyId.parse(value) as PassageId;
}

/**
 * Brands a validated non-empty string as {@link CommandId}.
 *
 * @param value - raw id
 */
export function asCommandId(value: string): CommandId {
  return nonEmptyId.parse(value) as CommandId;
}

/**
 * Brands a validated non-empty string as {@link TaskId}.
 *
 * @param value - raw id
 */
export function asTaskId(value: string): TaskId {
  return nonEmptyId.parse(value) as TaskId;
}

/**
 * Brands a validated non-empty string as {@link ModuleId}.
 *
 * @param value - raw id
 */
export function asModuleId(value: string): ModuleId {
  return nonEmptyId.parse(value) as ModuleId;
}

/**
 * Brands a validated non-empty string as {@link ProposalId}.
 *
 * @param value - raw id
 */
export function asProposalId(value: string): ProposalId {
  return nonEmptyId.parse(value) as ProposalId;
}

/**
 * Brands a validated non-empty string as {@link ClientActionId}.
 *
 * @param value - raw id
 */
export function asClientActionId(value: string): ClientActionId {
  return nonEmptyId.parse(value) as ClientActionId;
}
