import { describe, expect, test } from "bun:test";

import { COPY, stageLabel } from "./copy.ts";

describe("stageLabel", () => {
  test("maps known stages", () => {
    expect(stageLabel("narrate")).toBe(COPY.stages.narrate);
    expect(stageLabel("commit")).toBe(COPY.stages.commit);
  });

  test("returns null when finished or missing", () => {
    expect(stageLabel("narrate", "finished")).toBeNull();
    expect(stageLabel(undefined)).toBeNull();
  });

  test("passes through unknown stages", () => {
    expect(stageLabel("custom_stage")).toBe("custom_stage");
  });
});
