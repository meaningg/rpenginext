import { describe, expect, test } from "bun:test";

import { isEnterKey, isEscapeKey, isSlashKey } from "./hotkeys.ts";

function fakeKey(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return partial as KeyboardEvent;
}

describe("hotkeys layout independence", () => {
  test("slash matches physical code even when key is Russian '.'", () => {
    expect(isSlashKey(fakeKey({ code: "Slash", key: "." }))).toBe(true);
    expect(isSlashKey(fakeKey({ code: "Slash", key: "/" }))).toBe(true);
    expect(isSlashKey(fakeKey({ code: "KeyA", key: "ф" }))).toBe(false);
  });

  test("escape and enter match by code", () => {
    expect(isEscapeKey(fakeKey({ code: "Escape", key: "Escape" }))).toBe(true);
    expect(isEnterKey(fakeKey({ code: "Enter", key: "Enter" }))).toBe(true);
    expect(isEnterKey(fakeKey({ code: "NumpadEnter", key: "Enter" }))).toBe(
      true,
    );
  });
});
