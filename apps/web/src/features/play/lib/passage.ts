/** Maintenance / restore markers produced by core for non-player turns. */
const INTERNAL_PROSE_RE = /^\((?:system|restore)\)(?:\s|$)/i;

/**
 * True when prose is an internal engine marker, not player-facing narrative.
 *
 * @param prose - passage text
 */
export function isInternalPassageProse(prose: string): boolean {
  return INTERNAL_PROSE_RE.test(prose.trim());
}

/**
 * Player UI should only react to player turns (system/background is silent).
 *
 * @param turnKind - engine turn kind
 */
export function isPlayerTurnKind(turnKind: unknown): boolean {
  return turnKind == null || turnKind === "player";
}

/**
 * Splits narrator prose into readable paragraphs.
 * Prefers blank-line breaks; falls back to single newlines for denser text.
 *
 * @param content - full prose block
 */
export function splitNarrativeParagraphs(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const byBlank = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const byLine = normalized
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  return byLine.length > 0 ? byLine : [normalized];
}
