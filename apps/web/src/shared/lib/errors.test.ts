import { describe, expect, test } from "bun:test";

import { ApiError } from "../api/http.ts";
import { COPY } from "../config/copy.ts";
import { toUserMessage } from "./errors.ts";

describe("toUserMessage", () => {
  test("maps offline / network failures", () => {
    expect(toUserMessage(new TypeError("Failed to fetch"))).toBe(
      COPY.errors.offline,
    );
  });

  test("maps auth and not-found ApiError", () => {
    expect(toUserMessage(new ApiError("x", 401))).toBe(COPY.errors.unauthorized);
    expect(toUserMessage(new ApiError("x", 404))).toBe(COPY.errors.notFound);
  });

  test("prefers friendly API message when present", () => {
    expect(toUserMessage(new ApiError("Ход отклонён правилами", 400))).toBe(
      "Ход отклонён правилами",
    );
  });
});
