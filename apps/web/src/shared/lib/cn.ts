/**
 * Joins class names, skipping falsy values.
 *
 * @param parts - class tokens
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
