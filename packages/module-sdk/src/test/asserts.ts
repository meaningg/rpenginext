import type { JsonObject, TurnResult } from "@rpengineext/contracts";

import type { ModuleTestHarness } from "./harness.ts";

/**
 * Asserts a turn committed. Throws otherwise.
 *
 * @param turn - turn result
 */
export function expectCommitted(turn: TurnResult): asserts turn is Extract<TurnResult, { status: "committed" }> {
  if (turn.status !== "committed") {
    throw new Error(
      `expectCommitted: turn was ${turn.status} (${turn.failure?.code ?? "?"}): ${turn.failure?.message ?? ""}`,
    );
  }
}

/**
 * Asserts a turn was rejected, optionally with a stable failure code.
 *
 * @param turn - turn result
 * @param code - optional expected failure code
 */
export function expectRejected(
  turn: TurnResult,
  code?: string,
): asserts turn is Extract<TurnResult, { status: "rejected" }> {
  if (turn.status !== "rejected") {
    throw new Error(
      `expectRejected: turn committed (${turn.turnId}) — expected rejection${code ? ` with code ${code}` : ""}`,
    );
  }
  if (code && turn.failure.code !== code) {
    throw new Error(
      `expectRejected: expected code "${code}" but got "${turn.failure.code}" (${turn.failure.message})`,
    );
  }
}

/**
 * Asserts a slice matches the given partial (deep subset) after the latest turn.
 *
 * @param harness - active harness
 * @param name - slice name
 * @param partial - expected subset of the slice
 */
export function expectSlice(
  harness: ModuleTestHarness,
  name: string,
  partial: Record<string, unknown>,
): void {
  const value = harness.sliceOf<JsonObject>(name);
  if (value === undefined) {
    throw new Error(`expectSlice: slice "${name}" does not exist`);
  }
  for (const [key, expected] of Object.entries(partial)) {
    const actual = (value as Record<string, unknown>)[key];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `expectSlice: slice "${name}" key "${key}" = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
  }
}

/**
 * Asserts an event with the canonical name was dispatched, optionally with a
 * partial payload match (last matching event wins).
 *
 * @param harness - active harness
 * @param name - canonical event name
 * @param partialPayload - optional payload subset
 */
export function expectEvent(
  harness: ModuleTestHarness,
  name: string,
  partialPayload?: Record<string, unknown>,
): void {
  const matching = harness.events.filter((e) => e.name === name);
  if (matching.length === 0) {
    const known = [...new Set(harness.events.map((e) => e.name))].join(", ");
    throw new Error(
      `expectEvent: no "${name}" dispatched (seen: ${known || "(none)"})`,
    );
  }
  if (!partialPayload) return;
  const last = matching[matching.length - 1]!;
  for (const [key, expected] of Object.entries(partialPayload)) {
    const actual = (last.payload as Record<string, unknown>)[key];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `expectEvent: "${name}" payload key "${key}" = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
  }
}