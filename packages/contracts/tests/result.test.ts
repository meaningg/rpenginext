import { describe, expect, test } from "bun:test";

import {
  err,
  failure,
  isErr,
  isOk,
  mapResult,
  ok,
} from "../src/result.ts";

describe("result", () => {
  test("success: ok wraps value", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  test("error path: err wraps failure", () => {
    const error = failure("INTERNAL", "boom", { causedBy: ["core"] });
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.causedBy).toEqual(["core"]);
    }
  });

  test("edge: mapResult maps ok and preserves err", () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
    const failed = err(failure("X", "nope"));
    expect(mapResult(failed, (n: number) => n + 1)).toEqual(failed);
  });
});
