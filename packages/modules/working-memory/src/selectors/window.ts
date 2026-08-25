import type { WorkingMemoryPair } from "../schema.ts";

/**
 * Chat message shape for narrative.write history.
 */
export interface HistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * Returns the last `windowPairs` pairs from an unbounded archive.
 *
 * @param entries - full archive
 * @param windowPairs - positive pair count
 */
export function selectLastPairs(
  entries: readonly WorkingMemoryPair[],
  windowPairs: number,
): readonly WorkingMemoryPair[] {
  const n = Math.max(0, Math.floor(windowPairs));
  if (n === 0 || entries.length === 0) return [];
  if (entries.length <= n) return entries;
  return entries.slice(entries.length - n);
}

/**
 * Flattens pairs into alternating user/assistant chat messages.
 *
 * @param pairs - ordered pairs (oldest → newest)
 */
export function flattenPairsToHistory(
  pairs: readonly WorkingMemoryPair[],
): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const pair of pairs) {
    out.push({ role: "user", content: pair.user });
    out.push({ role: "assistant", content: pair.assistant });
  }
  return out;
}

/**
 * Builds prompt history from full archive and window size.
 *
 * @param entries - full archive
 * @param windowPairs - N pairs
 */
export function buildPromptHistory(
  entries: readonly WorkingMemoryPair[],
  windowPairs: number,
): HistoryMessage[] {
  return flattenPairsToHistory(selectLastPairs(entries, windowPairs));
}
