import type { Result, Failure } from "../result.ts";

/**
 * Sink for finalized turn markdown dossiers.
 * Default impl writes under `data/traces/...`; tests use in-memory mocks.
 */
export interface TraceSinkPort {
  /**
   * Persists a rendered markdown trace.
   *
   * @param path - relative or absolute path chosen by core policy
   * @param markdown - full document body
   */
  write(path: string, markdown: string): Promise<Result<void, Failure>>;
}

/**
 * High-level trace outcome recorded at finalize.
 */
export type TraceOutcome = "committed" | "rejected";
