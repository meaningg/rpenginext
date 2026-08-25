import { describe, expect, test } from "bun:test";

import {
  buildSummaryPromptSection,
  chunkRange,
  shouldSummarize,
} from "../src/selectors/summaries.ts";
import type { SummaryChunk } from "../src/schema.ts";

function chunk(
  index: number,
  fromPairIndex: number,
  toPairIndex: number,
  text: string,
): SummaryChunk {
  return { index, fromPairIndex, toPairIndex, text, createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("summary selectors", () => {
  test("shouldSummarize fires exactly at the interval", () => {
    expect(shouldSummarize(2, 0, 2)).toBe(true);
    expect(shouldSummarize(1, 0, 2)).toBe(false);
  });

  test("shouldSummarize counts pairs since the last chunk", () => {
    expect(shouldSummarize(3, 2, 2)).toBe(false);
    expect(shouldSummarize(4, 2, 2)).toBe(true);
  });

  test("edge: non-positive interval is floored to 1", () => {
    expect(shouldSummarize(3, 0, 0)).toBe(true);
    expect(shouldSummarize(3, 0, -1)).toBe(true);
  });

  test("chunkRange covers exactly the un-summarized tail", () => {
    expect(chunkRange(0, 2)).toEqual({ fromPairIndex: 1, toPairIndex: 2 });
    expect(chunkRange(2, 5)).toEqual({ fromPairIndex: 3, toPairIndex: 5 });
  });

  test("buildSummaryPromptSection returns null when empty", () => {
    expect(buildSummaryPromptSection([])).toBeNull();
  });

  test("buildSummaryPromptSection renders chunks chronologically with ranges", () => {
    const text = buildSummaryPromptSection([
      chunk(1, 1, 2, "First chunk"),
      chunk(2, 3, 4, "Second chunk"),
    ]);
    expect(text).toContain("[1] turns #1–#2: First chunk");
    expect(text).toContain("[2] turns #3–#4: Second chunk");
    expect(text).toContain("Stay consistent with it");
  });

  test("edge: single-pair range renders turn #N", () => {
    const text = buildSummaryPromptSection([chunk(1, 5, 5, "Solo")]);
    expect(text).toContain("[1] turn #5: Solo");
  });
});
