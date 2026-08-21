import { describe, expect, test } from "bun:test";

import { storyKeys } from "./queries.ts";

describe("storyKeys", () => {
  test("list key is stable", () => {
    expect(storyKeys.list()).toEqual(["stories", "list"]);
  });

  test("detail key includes template id", () => {
    expect(storyKeys.detail("demo.book")).toEqual([
      "stories",
      "detail",
      "demo.book",
    ]);
  });

  test("root prefixes all keys", () => {
    expect(storyKeys.list()[0]).toBe(storyKeys.root[0]);
    expect(storyKeys.detail("x")[0]).toBe(storyKeys.root[0]);
  });
});
