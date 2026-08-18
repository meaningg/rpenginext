import { describe, expect, test } from "bun:test";
import path from "node:path";

import { StoryCatalog } from "../src/catalog.ts";

const ROOT_STORIES = path.resolve(import.meta.dir, "../../../data/stories");

describe("StoryCatalog", () => {
  test("loads bundled example data/stories templates", () => {
    const loaded = StoryCatalog.loadFromDirectory(ROOT_STORIES);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const list = loaded.value.list();
    // Public examples always present; private local stories may add more.
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(loaded.value.get("demo.hello")?.title).toBeTruthy();
    expect(loaded.value.get("demo.hello")?.locale).toBe("ru");
    expect(loaded.value.get("demo.book")?.seed).toBeTruthy();
    expect(loaded.value.get("demo.book")?.locale).toBe("ru");
    expect(loaded.value.get("demo.book")?.character?.name).toBeTruthy();
    expect(loaded.value.get("demo.book")?.worldCanon).toBeTruthy();
  });
});
