import { describe, expect, test } from "bun:test";

import { createSummaryModule, resolveSummaryConfig } from "../src/index.ts";

describe("summary config", () => {
  test("explicit intervalTurns wins", () => {
    expect(resolveSummaryConfig({ intervalTurns: 5 })).toEqual({
      intervalTurns: 5,
    });
  });

  test("default interval follows the working-memory window env variable", () => {
    expect(
      resolveSummaryConfig({ env: { RP_WORKING_MEMORY_WINDOW: "7" } }),
    ).toEqual({ intervalTurns: 7 });
  });

  test("edge: invalid intervalTurns falls back to the working-memory variable", () => {
    expect(
      resolveSummaryConfig({
        intervalTurns: 0,
        env: { RP_WORKING_MEMORY_WINDOW: "7" },
      }),
    ).toEqual({ intervalTurns: 7 });
    expect(
      resolveSummaryConfig({
        intervalTurns: -3,
        env: { RP_WORKING_MEMORY_WINDOW: "7" },
      }),
    ).toEqual({ intervalTurns: 7 });
  });

  test("edge: no env at all → working-memory default window (12)", () => {
    expect(resolveSummaryConfig({ env: {} })).toEqual({ intervalTurns: 12 });
  });

  test("edge: module compiles with env-derived default", () => {
    const mod = createSummaryModule({
      env: { RP_WORKING_MEMORY_WINDOW: "9" },
    });
    expect(mod.compiled).toBeTruthy();
    expect(mod.ir?.irVersion).toBe(1);
  });
});
