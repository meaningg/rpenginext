import { describe, expect, test } from "bun:test";

import { testModule } from "@rpengineext/module-sdk/test";

import {
  createCharacterModule,
  READ_MODEL_PROFILE,
  SLICE_NAME,
} from "../src/index.ts";

/**
 * Read-model `character.profile` contract tests.
 */
describe("character.profile read-model", () => {
  test("success: returns full profile from seeded slice", async () => {
    const h = await testModule(createCharacterModule(), {
      meta: {
        character: {
          name: "Alex",
          appearance: "tall, gray eyes",
          features: "scar on brow",
          outfit: "black jacket",
        },
      },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    expect(h.value.readModel(READ_MODEL_PROFILE)).toEqual({
      present: true,
      name: "Alex",
      appearance: "tall, gray eyes",
      features: "scar on brow",
      outfit: "black jacket",
    });
  });

  test("edge: empty slice without seed exposes present=false with blank fields", async () => {
    const h = await testModule(createCharacterModule(), {});
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    expect(h.value.readModel(READ_MODEL_PROFILE)).toEqual({
      present: false,
      name: "",
      appearance: "",
      features: "",
      outfit: "",
    });
  });

  test("edge: corrupt slice decays to the empty profile instead of throwing", async () => {
    const h = await testModule(createCharacterModule(), {});
    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const corruptState = {
      meta: { schemaVersion: 1, revision: 0, updatedAtTurnId: null },
      core: {
        turnIndex: 0,
        revision: 0,
        clock: new Date().toISOString(),
        flags: {},
        passageCursor: null,
      },
      slices: {
        [SLICE_NAME]: { schemaVersion: 1, present: true, name: 42 },
      },
    } as never;

    const result = h.value.runtime
      .getHostSurface()
      .getReadModel(READ_MODEL_PROFILE, corruptState, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        present: false,
        name: "",
        appearance: "",
        features: "",
        outfit: "",
      });
    }
  });
});