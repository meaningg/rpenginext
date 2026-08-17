import { describe, expect, test } from "bun:test";

import {
  mapCompletionToResponsesBody,
  mapCompletionToResponsesBodyWithoutJsonFormat,
} from "../src/map-request.ts";

describe("mapCompletionToResponsesBody", () => {
  test("maps system to instructions and single user to string input", () => {
    const body = mapCompletionToResponsesBody({
      model: "grok-test",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello" },
      ],
      responseFormat: "json",
      temperature: 0.2,
      maxTokens: 256,
    });

    expect(body.model).toBe("grok-test");
    expect(body.instructions).toBe("Be brief.");
    expect(body.input).toBe("Hello");
    expect(body.stream).toBe(false);
    expect(body.store).toBe(false);
    expect(body.temperature).toBe(0.2);
    expect(body.max_output_tokens).toBe(256);
    expect(body.text?.format.type).toBe("json_object");
  });

  test("without json format omits text.format", () => {
    const body = mapCompletionToResponsesBodyWithoutJsonFormat({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      responseFormat: "json",
    });
    expect(body.text).toBeUndefined();
    expect(body.input).toBe("x");
  });

  test("multi-turn becomes input array", () => {
    const body = mapCompletionToResponsesBody({
      model: "m",
      messages: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
      ],
    });
    expect(Array.isArray(body.input)).toBe(true);
    if (!Array.isArray(body.input)) return;
    expect(body.input).toHaveLength(3);
  });
});
