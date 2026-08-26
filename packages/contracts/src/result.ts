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

export interface FailureDetails {
  readonly moduleId?: string;
  readonly moduleIds?: readonly string[];
  readonly slice?: string;
  readonly op?: string;
  readonly capability?: string;
  readonly configKey?: string;
  readonly taskType?: string;
  readonly toolId?: string;
  readonly name?: string;
  readonly moment?: string;
  readonly event?: string;
  readonly fromVersion?: number;
  readonly [key: string]: unknown;
}

/**
 * Builds a stable author-facing module failure (specs/03 §4.1).
 *
 * Message pattern: `[<code>] <what failed> (module: <id>). Hint: <what to do>.`
 * Secret material (api keys, raw LLM dumps) must never be placed in details.
 *
 * @param code - stable machine code from the MODULE_FAILURE_CODES catalog
 * @param message - what failed + hint
 * @param details - structured details (moduleId / slice / op / …)
 */
export function moduleFailure(
  code: string,
  message: string,
  details?: FailureDetails,
): Failure {
  const { moduleId, ...rest } = details ?? {};
  const causedBy = moduleId ? [moduleId] : undefined;
  return failure(code, message, {
    details: Object.keys(rest).length > 0 ? rest : undefined,
    ...(causedBy ? { causedBy } : {}),
  });
}

/**
 * Error thrown by the sdk for author ctx violations (forbidden moment misuse).
 * Carries the stable module failure code; core/sdk wrap it into structured failures.
 */
export class ModuleCtxViolation extends Error {
  readonly code: string;
  override readonly message: string;
  readonly details?: FailureDetails;

  /**
   * @param code - stable machine code (e.g. MODULE_MOMENT_OP_FORBIDDEN)
   * @param message - what failed + hint
   * @param details - structured details
   */
  constructor(code: string, message: string, details?: FailureDetails) {
    super(message);
    this.name = "ModuleCtxViolation";
    this.code = code;
    this.message = message;
    this.details = details;
  }
}

/**
 * Type guard for {@link ModuleCtxViolation}.
 *
 * @param value - unknown thrown value
 */
export function isModuleCtxViolation(value: unknown): value is ModuleCtxViolation {
  return value instanceof ModuleCtxViolation;
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
