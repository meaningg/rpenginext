/**
 * Author-facing hard denial (guard / invariant / op validation).
 * Thrown inside handlers; sdk converts to engine Results.
 */
export class ModuleDenial extends Error {
  readonly code: string;
  override readonly message: string;

  /**
   * @param code - stable machine code
   * @param message - player-safe message
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = "ModuleDenial";
    this.code = code;
    this.message = message;
  }
}

/**
 * Reject the current turn or op with a structured denial.
 *
 * @param code - stable machine code
 * @param message - player-safe message
 */
export function deny(code: string, message: string): never {
  throw new ModuleDenial(code, message);
}

/**
 * Type guard for {@link ModuleDenial}.
 *
 * @param value - unknown thrown value
 */
export function isModuleDenial(value: unknown): value is ModuleDenial {
  return value instanceof ModuleDenial;
}
