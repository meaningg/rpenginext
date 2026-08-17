/**
 * Discriminated Result used on every external / module boundary.
 *
 * @typeParam T - success payload
 * @typeParam E - failure payload (default string code + message bag)
 */
export type Result<T, E = Failure> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Structured failure for contracts / runtime boundaries.
 * Player-facing text lives in `message`; technical detail in `details`.
 */
export interface Failure {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly causedBy?: readonly string[];
}

/**
 * Creates a successful {@link Result}.
 *
 * @param value - success payload
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed {@link Result}.
 *
 * @param error - failure payload
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Builds a {@link Failure} object.
 *
 * @param code - stable machine code
 * @param message - player-safe or operator-safe short message
 * @param extras - optional details / causedBy
 */
export function failure(
  code: string,
  message: string,
  extras?: { readonly details?: unknown; readonly causedBy?: readonly string[] },
): Failure {
  return {
    code,
    message,
    ...(extras?.details !== undefined ? { details: extras.details } : {}),
    ...(extras?.causedBy !== undefined ? { causedBy: extras.causedBy } : {}),
  };
}

/**
 * Maps a successful Result value; leaves errors unchanged.
 *
 * @param result - input result
 * @param fn - pure mapper
 */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (!result.ok) {
    return result;
  }
  return ok(fn(result.value));
}

/**
 * Type guard for successful results.
 *
 * @param result - result to narrow
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Type guard for failed results.
 *
 * @param result - result to narrow
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
