import { describe, expect, test } from "bun:test";

import { sessionKeys } from "./queries.ts";

describe("sessionKeys", () => {
  test("list key is stable", () => {
    expect(sessionKeys.list()).toEqual(["sessions", "list"]);
  });

  test("detail key includes session id", () => {
    expect(sessionKeys.detail("abc")).toEqual(["sessions", "detail", "abc"]);
  });

  test("root prefixes all keys", () => {
    expect(sessionKeys.list()[0]).toBe("sessions");
    expect(sessionKeys.detail("x")[0]).toBe("sessions");
  });
});
