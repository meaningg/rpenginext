import { describe, expect, test } from "bun:test";

import {
  extractStreamingProse,
  narrativeProseDelta,
} from "../src/agents/stream-prose.ts";

describe("stream prose extraction", () => {
  test("plain prose passes through", () => {
    expect(extractStreamingProse("Door opens.")).toBe("Door opens.");
  });

  test("extracts progressive prose from JSON fragments", () => {
    let raw = "";
    const chunks = [
      '{"prose":"You ',
      'enter the',
      ' hall.",}',
    ];
    let visible = "";
    for (const chunk of chunks) {
      const step = narrativeProseDelta(raw, chunk);
      raw = step.nextRaw;
      visible += step.proseDelta;
    }
    expect(visible).toBe("You enter the hall.");
  });

  test("suppresses non-prose JSON prefix", () => {
    const step = narrativeProseDelta("", '{,"me');
    expect(step.proseDelta).toBe("");
  });
});
