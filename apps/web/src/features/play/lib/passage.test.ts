import { describe, expect, test } from "bun:test";

import {
  isInternalPassageProse,
  isPlayerTurnKind,
  splitNarrativeParagraphs,
} from "./passage.ts";

describe("passage helpers", () => {
  test("detects internal markers", () => {
    expect(isInternalPassageProse("(system) sync")).toBe(true);
    expect(isInternalPassageProse("(restore) checkpoint")).toBe(true);
    expect(isInternalPassageProse("A quiet street.")).toBe(false);
  });

  test("player turn kinds", () => {
    expect(isPlayerTurnKind(undefined)).toBe(true);
    expect(isPlayerTurnKind("player")).toBe(true);
    expect(isPlayerTurnKind("system")).toBe(false);
  });

  test("splits paragraphs by blank lines", () => {
    expect(splitNarrativeParagraphs("One.\n\nTwo.")).toEqual(["One.", "Two."]);
  });
});
