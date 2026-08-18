import { describe, expect, test } from "bun:test";

import { createTestEngine } from "@rpengineext/core/testing";

import {
  createWorkingMemoryModule,
  SLICE_NAME,
} from "../src/index.ts";
import {
  AppendPairPayloadSchema,
  createEmptyWorkingMemorySlice,
  type WorkingMemorySlice,
} from "../src/schema.ts";

describe("working_memory.append_pair", () => {
  test("success: payload schema accepts pair", () => {
    const parsed = AppendPairPayloadSchema.safeParse({
      turnId: "trn_1",
      user: "hello",
      assistant: "Once upon a time…",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  test("error: rejects empty user", () => {
    const parsed = AppendPairPayloadSchema.safeParse({
      turnId: "trn_1",
      user: "",
      assistant: "prose",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  test("edge: module appends pairs across turns", async () => {
    const created = await createTestEngine({
      modules: [createWorkingMemoryModule({ windowPairs: 3 })],
      moduleConfig: {
        working_memory: { windowPairs: 3 },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    for (let i = 1; i <= 3; i++) {
      const turn = await session.value.submitAction({
        kind: "free_text",
        text: `hello ${i}`,
      });
      expect(turn.status).toBe("committed");
    }

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices[SLICE_NAME] as WorkingMemorySlice;
    expect(slice.entries.length).toBe(3);
    expect(createEmptyWorkingMemorySlice().entries).toHaveLength(0);
  });
});
