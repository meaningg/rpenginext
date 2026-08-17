/**
 * Deep-clones a JSON-compatible value via structuredClone.
 *
 * @param value - value to clone
 */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
