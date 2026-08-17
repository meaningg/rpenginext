/**
 * Deep-freezes an object graph for readonly turn views.
 * Returns the same reference typed as readonly T.
 *
 * @param value - object or array root
 */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value as object)) {
    const child = (value as Record<string | symbol, unknown>)[key];
    if (child && typeof child === "object") {
      deepFreeze(child);
    }
  }
  return value;
}
