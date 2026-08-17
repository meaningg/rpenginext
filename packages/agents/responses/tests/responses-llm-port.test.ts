import { describe, expect, test } from "bun:test";

import { ResponsesLlmPort } from "../src/responses-llm-port.ts";

describe("ResponsesLlmPort", () => {
  test("success path posts to /responses and maps body", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const port = new ResponsesLlmPort({
      baseUrl: "http://example.test/v1",
      apiKey: "g2a_test",
      fetch: (async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            output_text: "hello from model",
            usage: { input_tokens: 1, output_tokens: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const result = await port.complete({
      model: "grok-test",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      responseFormat: "text",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("hello from model");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://example.test/v1/responses");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer g2a_test");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.store).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.model).toBe("grok-test");
  });

  test("retries without json format after 400", async () => {
    let n = 0;
    const port = new ResponsesLlmPort({
      baseUrl: "http://example.test/v1/",
      apiKey: "k",
      fetch: (async (_url, init) => {
        n += 1;
        const body = JSON.parse(String(init?.body));
        if (n === 1) {
          expect(body.text?.format?.type).toBe("json_object");
          return new Response(JSON.stringify({ error: "unsupported format" }), {
            status: 400,
          });
        }
        expect(body.text).toBeUndefined();
        return new Response(
          JSON.stringify({ output_text: '{"prose":"ok"}' }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    const result = await port.complete({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      responseFormat: "json",
    });
    expect(result.ok).toBe(true);
    expect(n).toBe(2);
  });

  test("HTTP error surfaces LLM_HTTP", async () => {
    const port = new ResponsesLlmPort({
      baseUrl: "http://example.test/v1",
      apiKey: "k",
      fetch: (async () =>
        new Response("nope", { status: 500 })) as unknown as typeof fetch,
    });
    const result = await port.complete({
      model: "m",
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LLM_HTTP");
  });
});
