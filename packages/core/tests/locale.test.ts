import { describe, expect, test } from "bun:test";

import {
  DEFAULT_TURN_LOCALE,
  normalizeLocale,
  resolveTurnLocale,
} from "../src/util/locale.ts";

describe("locale helpers", () => {
  test("normalizeLocale maps common aliases", () => {
    expect(normalizeLocale("русский")).toBe("ru");
    expect(normalizeLocale("Russian")).toBe("ru");
    expect(normalizeLocale("en-us")).toBe("en-US");
    expect(normalizeLocale("ru-RU")).toBe("ru-RU");
  });

  test("resolveTurnLocale prefers session meta over config", () => {
    expect(resolveTurnLocale({ locale: "ru" }, "en")).toBe("ru");
    expect(resolveTurnLocale({ locale: "русский" }, "en")).toBe("ru");
    expect(resolveTurnLocale({}, "en-GB")).toBe("en-GB");
    expect(resolveTurnLocale(undefined, undefined)).toBe(DEFAULT_TURN_LOCALE);
    expect(resolveTurnLocale({ locale: "  " }, "  ")).toBe(DEFAULT_TURN_LOCALE);
  });
});
