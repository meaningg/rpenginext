import { describe, expect, test } from "bun:test";

import {
  enqueueModuleOpProposal,
  setModuleSystemSchedules,
  takeModuleOpProposals,
  takeModuleSystemSchedules,
} from "../src/modules/module-proposals.ts";

describe("module proposal protocol", () => {
  test("success: enqueue and take by module", () => {
    const extras: Record<string, unknown> = {};
    enqueueModuleOpProposal(extras, {
      moduleId: "a",
      slice: "a",
      op: "x",
      payload: { n: 1 },
      reason: "t",
    });
    enqueueModuleOpProposal(extras, {
      moduleId: "b",
      slice: "b",
      op: "y",
      payload: {},
      reason: "t",
    });
    const a = takeModuleOpProposals(extras, "a");
    expect(a).toHaveLength(1);
    expect(a[0]?.op).toBe("x");
    const b = takeModuleOpProposals(extras, "b");
    expect(b).toHaveLength(1);
    expect(takeModuleOpProposals(extras)).toHaveLength(0);
  });

  test("error path: empty take is safe", () => {
    expect(takeModuleOpProposals({})).toEqual([]);
    expect(takeModuleSystemSchedules({}, "x")).toEqual([]);
  });

  test("edge: system schedules set/take", () => {
    const extras: Record<string, unknown> = {};
    setModuleSystemSchedules(extras, "m", [
      { reason: "r", mode: "background", payload: { k: 1 } },
    ]);
    const got = takeModuleSystemSchedules(extras, "m");
    expect(got).toHaveLength(1);
    expect(got[0]?.reason).toBe("r");
    expect(takeModuleSystemSchedules(extras, "m")).toEqual([]);
  });
});
