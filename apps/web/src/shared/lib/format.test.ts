import { describe, expect, test } from "bun:test";

import { formatClock, formatUpdatedAt } from "./format.ts";

describe("format", () => {
  test("formatClock returns localized time for valid iso", () => {
    const value = formatClock("2026-08-17T12:34:00.000Z");
    expect(value.length).toBeGreaterThan(0);
  });

  test("formatClock returns empty string for invalid iso", () => {
    expect(formatClock("not-a-date")).toBe("");
  });

  test("formatUpdatedAt falls back to raw string when invalid", () => {
    expect(formatUpdatedAt("bad")).toBe("bad");
  });

  test("formatUpdatedAt returns relative or absolute string", () => {
    const recent = formatUpdatedAt(new Date().toISOString());
    expect(recent.length).toBeGreaterThan(0);
  });
});
