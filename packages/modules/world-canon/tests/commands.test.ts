import { describe, expect, test } from "bun:test";

import { createTestEngine } from "@rpengineext/core/testing";

import { createWorldCanonModule, SLICE_NAME } from "../src/index.ts";

describe("world_canon commands", () => {
  test("success: seed sets present text", async () => {
    const created = await createTestEngine({
      modules: [createWorldCanonModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession({
      meta: { worldCanon: "The Empire never fell." },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as {
      present: boolean;
      text: string;
    };
    expect(slice.present).toBe(true);
    expect(slice.text).toBe("The Empire never fell.");
  });

  test("error: blank worldCanon does not seed", async () => {
    const created = await createTestEngine({
      modules: [createWorldCanonModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession({
      meta: { worldCanon: "   " },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as { present: boolean };
    expect(slice.present).toBe(false);
  });

  test("edge: trims surrounding whitespace on seed", async () => {
    const created = await createTestEngine({
      modules: [createWorldCanonModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession({
      meta: { worldCanon: "  Canon line.  " },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as { text: string };
    expect(slice.text).toBe("Canon line.");
  });
});
