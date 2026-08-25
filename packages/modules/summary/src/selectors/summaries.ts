import type { SummaryChunk } from "../schema.ts";

/**
 * Chunk range in 1-based pair indexes (== campaign turn numbers).
 */
export type ChunkRange = {
  readonly fromPairIndex: number;
  readonly toPairIndex: number;
};

/**
 * Whether a new summary chunk is due: enough pairs have accumulated since
 * the last stored chunk.
 *
 * @param totalPairCount - current working-memory pair count
 * @param lastSummarizedPairCount - pair count already covered by chunks
 * @param intervalTurns - interval (positive)
 */
export function shouldSummarize(
  totalPairCount: number,
  lastSummarizedPairCount: number,
  intervalTurns: number,
): boolean {
  const interval = Math.max(1, Math.floor(intervalTurns));
  return totalPairCount >= lastSummarizedPairCount + interval;
}

/**
 * Computes the next chunk range (exactly the un-covered tail of the archive).
 *
 * @param lastSummarizedPairCount - pair count already covered
 * @param totalPairCount - current working-memory pair count
 */
export function chunkRange(
  lastSummarizedPairCount: number,
  totalPairCount: number,
): ChunkRange {
  return {
    fromPairIndex: lastSummarizedPairCount + 1,
    toPairIndex: totalPairCount,
  };
}

/**
 * Renders all stored chunks as the narrative system section text
 * (chronological, numbered). Returns null when nothing is stored yet.
 *
 * @param summaries - stored chunks (oldest → newest)
 */
export function buildSummaryPromptSection(
  summaries: readonly SummaryChunk[],
): string | null {
  if (summaries.length === 0) return null;
  const lines = summaries.map((chunk) => {
    const range =
      chunk.fromPairIndex === chunk.toPairIndex
        ? `turn #${chunk.fromPairIndex}`
        : `turns #${chunk.fromPairIndex}–#${chunk.toPairIndex}`;
    return `[${chunk.index}] ${range}: ${chunk.text}`;
  });
  return [
    ...lines,
    "The above is a condensed, chronological record of past events. Stay consistent with it; the most recent turns are in the chat history.",
  ].join("\n\n");
}
