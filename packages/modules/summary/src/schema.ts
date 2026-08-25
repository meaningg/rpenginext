import { z } from "zod";

import { MAX_SUMMARY_LENGTH } from "./constants.ts";

/**
 * One working-memory pair passed into the summary task input.
 * Shape mirrors `WorkingMemoryPair` from module-working-memory (kept in sync).
 */
export const SummaryPairSchema = z
  .object({
    turnId: z.string().min(1),
    user: z.string().min(1),
    assistant: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .strict();

export type SummaryPair = z.infer<typeof SummaryPairSchema>;

/**
 * One stored summary chunk (delta: covers pairs fromPairIndex..toPairIndex).
 */
export const SummaryChunkSchema = z
  .object({
    /** 1-based chunk number in chronological order. */
    index: z.number().int().positive(),
    /** 1-based index of the first working-memory pair covered (inclusive). */
    fromPairIndex: z.number().int().positive(),
    /** 1-based index of the last working-memory pair covered (inclusive). */
    toPairIndex: z.number().int().positive(),
    text: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .strict();

export type SummaryChunk = z.infer<typeof SummaryChunkSchema>;

/**
 * Authoritative summary slice: all chunks + how many pairs are covered.
 */
export const SummarySliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    lastSummarizedPairCount: z.number().int().nonnegative(),
    summaries: z.array(SummaryChunkSchema),
  })
  .strict();

export type SummarySlice = {
  readonly schemaVersion: 1;
  readonly lastSummarizedPairCount: number;
  readonly summaries: readonly SummaryChunk[];
};

/**
 * Empty slice seed for new sessions.
 */
export function createEmptySummarySlice(): SummarySlice {
  return {
    schemaVersion: 1,
    lastSummarizedPairCount: 0,
    summaries: [],
  };
}

/**
 * Safely reads the slice from world state (missing → empty).
 *
 * @param raw - slices.summary value
 */
export function parseSummarySlice(raw: unknown): SummarySlice {
  const parsed = SummarySliceSchema.safeParse(raw);
  return parsed.success ? parsed.data : createEmptySummarySlice();
}

/**
 * Payload for `summary.store_summary`.
 */
export const StoreSummaryPayloadSchema = z
  .object({
    index: z.number().int().positive(),
    fromPairIndex: z.number().int().positive(),
    toPairIndex: z.number().int().positive(),
    text: z.string().min(1).max(MAX_SUMMARY_LENGTH),
    createdAt: z.string().min(1),
  })
  .strict();

export type StoreSummaryPayload = z.infer<typeof StoreSummaryPayloadSchema>;

/**
 * Input for the `summary.make` agent task (scheduled from turn.committed).
 */
export const SummaryMakeInputSchema = z
  .object({
    sourceTurnId: z.string().min(1),
    /** Pair count already covered by stored chunks. */
    lastSummarizedPairCount: z.number().int().nonnegative(),
    /** Range the new chunk must cover (computed by the module, not the LLM). */
    chunk: z
      .object({
        fromPairIndex: z.number().int().positive(),
        toPairIndex: z.number().int().positive(),
      })
      .strict(),
    /** Full working-memory archive (context: the entire current working memory). */
    entries: z.array(SummaryPairSchema),
    /** Already stored chunks (context for consistency, no repetition). */
    previousSummaries: z.array(
      z
        .object({
          index: z.number().int().positive(),
          text: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type SummaryMakeInput = z.infer<typeof SummaryMakeInputSchema>;

/**
 * Final JSON the model must output after storing the chunk.
 */
export const SummaryMakeOutputSchema = z
  .object({
    stored: z.literal(true),
  })
  .strict();

export type SummaryMakeOutput = z.infer<typeof SummaryMakeOutputSchema>;

/**
 * Args for the `summary.store` tool — the model provides only the text;
 * the chunk range is computed by the handler from the current state.
 */
export const StoreSummaryArgsSchema = z
  .object({
    summary: z.string().min(1).max(MAX_SUMMARY_LENGTH),
  })
  .strict();

export type StoreSummaryArgs = z.infer<typeof StoreSummaryArgsSchema>;

/**
 * Tool result: stored chunk meta.
 */
export const StoreSummaryResultSchema = z
  .object({
    ok: z.literal(true),
    index: z.number().int().positive(),
    fromPairIndex: z.number().int().positive(),
    toPairIndex: z.number().int().positive(),
  })
  .strict();

export type StoreSummaryResult = z.infer<typeof StoreSummaryResultSchema>;
