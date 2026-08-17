import { describe, expect, test } from "bun:test";

import {
  extractPartialJsonStringField,
  extractStreamingProse,
} from "./extract-streaming-prose.ts";

describe("extractStreamingProse", () => {
  test("returns plain prose when buffer is not JSON", () => {
    expect(extractStreamingProse("The door creaks open.")).toBe(
      "The door creaks open.",
    );
  });

  test("extracts complete prose from finished JSON", () => {
    const raw = JSON.stringify({
      prose: 'She whispers "wait".',
      meta: { tone: "tense" },
    });
    expect(extractStreamingProse(raw)).toBe('She whispers "wait".');
  });

  test("extracts partial prose while JSON is still streaming", () => {
    const raw =
      '{"prose":"You step into the fog","meta":{"t';
    expect(extractStreamingProse(raw)).toBe("You step into the fog");
  });

  test("returns empty string before prose value starts", () => {
    expect(extractStreamingProse('{,"pro')).toBe("");
    expect(extractStreamingProse('{"prose":')).toBe("");
  });

  test("decodes common JSON escapes inside prose", () => {
    expect(extractStreamingProse('{"prose":"line1\\nline2\\t\\"ok\\""}')).toBe(
      'line1\nline2\t"ok"',
    );
  });

  test("handles unicode escapes", () => {
    expect(extractStreamingProse('{"prose":"caf\\u00e9"}')).toBe("café");
  });
});

describe("extractPartialJsonStringField", () => {
  test("returns null when field is absent", () => {
    expect(extractPartialJsonStringField('{"meta":{}}', "prose")).toBeNull();
  });

  test("stops cleanly on incomplete escape", () => {
    expect(extractPartialJsonStringField('{"prose":"hi\\', "prose")).toBe(
      "hi",
    );
  });
});
