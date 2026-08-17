import { describe, expect, test } from "bun:test";

import { mapResponsesPayloadToCompletion } from "../src/map-response.ts";

describe("mapResponsesPayloadToCompletion", () => {
  test("reads output_text and usage", () => {
    const mapped = mapResponsesPayloadToCompletion({
      output_text: '{"prose":"hi","choiceDrafts":[]}',
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.value.text).toContain("prose");
    expect(mapped.value.usage?.promptTokens).toBe(10);
    expect(mapped.value.usage?.completionTokens).toBe(5);
  });

  test("walks output message content", () => {
    const mapped = mapResponsesPayloadToCompletion({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "story" }],
        },
      ],
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.value.text).toBe("story");
  });

  test("provider error object fails", () => {
    const mapped = mapResponsesPayloadToCompletion({
      error: { message: "nope" },
    });
    expect(mapped.ok).toBe(false);
  });
});
