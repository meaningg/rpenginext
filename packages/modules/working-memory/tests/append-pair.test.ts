import { describe, expect, test } from "bun:test";

import { createEmptyWorldState } from "@rpengineext/contracts";

import { applyAppendPair } from "../src/apply/append-pair.ts";
import { COMMAND_TYPES, SLICE_NAME } from "../src/constants.ts";
import { createEmptyWorkingMemorySlice } from "../src/schema/slice.ts";

describe("working_memory.append_pair apply", () => {
  test("success: appends pair to empty slice", () => {
    const state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyWorkingMemorySlice() as never,
      },
    };
    const result = applyAppendPair(state, {
      commandId: "cmd_1",
      type: COMMAND_TYPES.appendPair,
      slice: SLICE_NAME,
      payload: {
        turnId: "trn_1",
        user: "hello",
        assistant: "Once upon a time…",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      source: { kind: "module", id: "working-memory" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slice = result.value.slices[SLICE_NAME] as {
      entries: { user: string; assistant: string }[];
    };
    expect(slice.entries).toHaveLength(1);
    expect(slice.entries[0]?.user).toBe("hello");
    expect(slice.entries[0]?.assistant).toBe("Once upon a time…");
  });

  test("error: rejects empty user", () => {
    const state = createEmptyWorldState("2026-01-01T00:00:00.000Z");
    const result = applyAppendPair(state, {
      commandId: "cmd_2",
      type: COMMAND_TYPES.appendPair,
      slice: SLICE_NAME,
      payload: {
        turnId: "trn_1",
        user: "",
        assistant: "prose",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      source: { kind: "module", id: "working-memory" },
    });
    expect(result.ok).toBe(false);
  });

  test("edge: appends multiple pairs without trimming", () => {
    let state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyWorkingMemorySlice() as never,
      },
    };
    for (let i = 1; i <= 5; i++) {
      const next = applyAppendPair(state, {
        commandId: `cmd_${i}`,
        type: COMMAND_TYPES.appendPair,
        slice: SLICE_NAME,
        payload: {
          turnId: `trn_${i}`,
          user: `u${i}`,
          assistant: `a${i}`,
          createdAt: `2026-01-01T00:00:0${i}.000Z`,
        },
        source: { kind: "module", id: "working-memory" },
      });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      state = next.value as typeof state;
    }
    const slice = state.slices[SLICE_NAME] as { entries: unknown[] };
    expect(slice.entries).toHaveLength(5);
  });
});
