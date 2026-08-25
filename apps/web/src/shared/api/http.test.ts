import { describe, expect, test } from "bun:test";

import { ApiError, parseJson } from "./http.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseJson", () => {
  test("returns payload on success", async () => {
    const data = await parseJson<{ ok: boolean }>(jsonResponse({ ok: true }));
    expect(data.ok).toBe(true);
  });

  test("throws ApiError with message and code", async () => {
    try {
      await parseJson(
        jsonResponse(
          { error: { message: "Не найдено", code: "not_found" } },
          404,
        ),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe("Не найдено");
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("not_found");
    }
  });

  test("falls back to HTTP status text when body empty", async () => {
    try {
      await parseJson(new Response("", { status: 500 }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("HTTP 500");
    }
  });
});
