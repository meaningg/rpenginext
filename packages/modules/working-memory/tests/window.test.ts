import { describe, expect, test } from "bun:test";

import type { WorkingMemoryPair } from "../src/schema/pair.ts";
import {
  buildPromptHistory,
  flattenPairsToHistory,
  selectLastPairs,
} from "../src/selectors/window.ts";

function pair(i: number): WorkingMemoryPair {
  return {
    turnId: `trn_${i}`,
    user: `user-${i}`,
    assistant: `assistant-${i}`,
    createdAt: `2026-01-0${i}T00:00:00.000Z`,
  };
}

describe("working-memory window selectors", () => {
  test("selectLastPairs returns last N", () => {
    const entries = [pair(1), pair(2), pair(3), pair(4), pair(5)];
    const last = selectLastPairs(entries, 2);
    expect(last).toHaveLength(2);
    expect(last[0]?.user).toBe("user-4");
    expect(last[1]?.user).toBe("user-5");
  });

  test("selectLastPairs when N >= length returns all", () => {
    const entries = [pair(1), pair(2)];
    expect(selectLastPairs(entries, 10)).toHaveLength(2);
  });

  test("flattenPairsToHistory alternates user/assistant", () => {
    const history = flattenPairsToHistory([pair(1), pair(2)]);
    expect(history).toEqual([
      { role: "user", content: "user-1" },
      { role: "assistant", content: "assistant-1" },
      { role: "user", content: "user-2" },
      { role: "assistant", content: "assistant-2" },
    ]);
  });

  test("buildPromptHistory applies window", () => {
    const entries = [pair(1), pair(2), pair(3)];
    const history = buildPromptHistory(entries, 1);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "user-3" });
    expect(history[1]).toEqual({ role: "assistant", content: "assistant-3" });
  });
});
