import { describe, expect, test } from "bun:test";

import { createEmptyWorldState } from "@rpengineext/contracts";

import { applySeed } from "../src/apply/seed.ts";
import { applySetOutfit } from "../src/apply/set-outfit.ts";
import { COMMAND_TYPES, SLICE_NAME } from "../src/constants.ts";
import { createEmptyCharacterSlice } from "../src/schema/slice.ts";

describe("character commands", () => {
  test("success: seed then set_outfit", () => {
    let state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyCharacterSlice() as never,
      },
    };

    const seeded = applySeed(state, {
      commandId: "cmd_1",
      type: COMMAND_TYPES.seed,
      slice: SLICE_NAME,
      payload: {
        name: "Alex",
        appearance: "tall",
        features: "scar",
        outfit: "jacket",
      },
      source: { kind: "module", id: "character" },
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    state = seeded.value as typeof state;

    const updated = applySetOutfit(state, {
      commandId: "cmd_2",
      type: COMMAND_TYPES.setOutfit,
      slice: SLICE_NAME,
      payload: { outfit: "red coat" },
      source: { kind: "module", id: "character" },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const slice = updated.value.slices[SLICE_NAME] as { outfit: string };
    expect(slice.outfit).toBe("red coat");
  });

  test("error: set_outfit without present character", () => {
    const state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyCharacterSlice() as never,
      },
    };
    const result = applySetOutfit(state, {
      commandId: "cmd_x",
      type: COMMAND_TYPES.setOutfit,
      slice: SLICE_NAME,
      payload: { outfit: "hat" },
      source: { kind: "module", id: "character" },
    });
    expect(result.ok).toBe(false);
  });

  test("edge: rejects empty outfit", () => {
    let state = {
      ...createEmptyWorldState("2026-01-01T00:00:00.000Z"),
      slices: {
        [SLICE_NAME]: createEmptyCharacterSlice() as never,
      },
    };
    const seeded = applySeed(state, {
      commandId: "cmd_1",
      type: COMMAND_TYPES.seed,
      slice: SLICE_NAME,
      payload: {
        name: "Alex",
        appearance: "tall",
        features: "scar",
        outfit: "jacket",
      },
      source: { kind: "module", id: "character" },
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    state = seeded.value as typeof state;

    const result = applySetOutfit(state, {
      commandId: "cmd_2",
      type: COMMAND_TYPES.setOutfit,
      slice: SLICE_NAME,
      payload: { outfit: "   " },
      source: { kind: "module", id: "character" },
    });
    expect(result.ok).toBe(false);
  });
});
