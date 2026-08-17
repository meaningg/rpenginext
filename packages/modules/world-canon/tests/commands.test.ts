import { describe, expect, test } from "bun:test";

import { createEmptyWorldState } from "@rpengineext/contracts";

import { applySeed } from "../src/apply/seed.ts";
import { COMMAND_TYPES, SLICE_NAME } from "../src/constants.ts";
import { createEmptyWorldCanonSlice } from "../src/schema/slice.ts";

describe("world_canon commands", () => {
  test("success: seed sets present text", () => {
    const state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyWorldCanonSlice() as never,
      },
    };

    const seeded = applySeed(state, {
      commandId: "cmd_1",
      type: COMMAND_TYPES.seed,
      slice: SLICE_NAME,
      payload: { text: "The Empire never fell." },
      source: { kind: "module", id: "world_canon" },
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    const slice = seeded.value.slices[SLICE_NAME] as {
      present: boolean;
      text: string;
    };
    expect(slice.present).toBe(true);
    expect(slice.text).toBe("The Empire never fell.");
  });

  test("error: rejects empty text", () => {
    const state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyWorldCanonSlice() as never,
      },
    };
    const result = applySeed(state, {
      commandId: "cmd_x",
      type: COMMAND_TYPES.seed,
      slice: SLICE_NAME,
      payload: { text: "   " },
      source: { kind: "module", id: "world_canon" },
    });
    expect(result.ok).toBe(false);
  });

  test("edge: trims surrounding whitespace", () => {
    const state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyWorldCanonSlice() as never,
      },
    };
    const seeded = applySeed(state, {
      commandId: "cmd_1",
      type: COMMAND_TYPES.seed,
      slice: SLICE_NAME,
      payload: { text: "  Canon line.  " },
      source: { kind: "module", id: "world_canon" },
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    const slice = seeded.value.slices[SLICE_NAME] as { text: string };
    expect(slice.text).toBe("Canon line.");
  });
});
