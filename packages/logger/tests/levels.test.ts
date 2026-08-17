import { describe, expect, test } from "bun:test";

import {
  DEFAULT_LOG_LEVEL,
  isLogLevel,
  LOG_LEVELS,
  resolveLogLevel,
} from "../src/levels.ts";

describe("levels", () => {
  test("success: isLogLevel accepts supported levels", () => {
    for (const level of LOG_LEVELS) {
      expect(isLogLevel(level)).toBe(true);
    }
  });

  test("error path: isLogLevel rejects unknown values", () => {
    expect(isLogLevel("verbose")).toBe(false);
    expect(isLogLevel(30)).toBe(false);
    expect(isLogLevel(undefined)).toBe(false);
    expect(isLogLevel(null)).toBe(false);
  });

  test("edge: resolveLogLevel prefers explicit, then env, then default", () => {
    expect(resolveLogLevel("warn", "debug")).toBe("warn");
    expect(resolveLogLevel(undefined, "error")).toBe("error");
    expect(resolveLogLevel(undefined, undefined)).toBe(DEFAULT_LOG_LEVEL);
    expect(resolveLogLevel(undefined, "")).toBe(DEFAULT_LOG_LEVEL);
  });

  test("edge: resolveLogLevel throws on invalid explicit or env", () => {
    expect(() => resolveLogLevel("trace" as never)).toThrow(TypeError);
    expect(() => resolveLogLevel(undefined, "trace")).toThrow(TypeError);
  });
});
