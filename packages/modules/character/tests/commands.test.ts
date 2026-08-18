import { describe, expect, test } from "bun:test";

import { createTestEngine } from "@rpengineext/core/testing";

import {
  createCharacterModule,
  createEmptyCharacterSlice,
  SLICE_NAME,
} from "../src/index.ts";
import {
  SeedCharacterPayloadSchema,
  SetOutfitPayloadSchema,
} from "../src/schema.ts";

describe("character commands", () => {
  test("success: seed from meta", async () => {
    const created = await createTestEngine({
      modules: [createCharacterModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession({
      meta: {
        character: {
          name: "Alex",
          appearance: "tall",
          features: "scar",
          outfit: "jacket",
        },
      },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as {
      present: boolean;
      name: string;
      outfit: string;
    };
    expect(slice.present).toBe(true);
    expect(slice.name).toBe("Alex");
    expect(slice.outfit).toBe("jacket");
  });

  test("error: set_outfit payload rejects empty string", () => {
    const parsed = SetOutfitPayloadSchema.safeParse({ outfit: "" });
    expect(parsed.success).toBe(false);
  });

  test("edge: empty character slice factory", () => {
    const empty = createEmptyCharacterSlice();
    expect(empty.present).toBe(false);
    expect(SeedCharacterPayloadSchema.safeParse({
      name: "A",
      appearance: "B",
      features: "C",
      outfit: "D",
    }).success).toBe(true);
  });
});
