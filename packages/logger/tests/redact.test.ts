import { describe, expect, test } from "bun:test";

import { createLogger } from "../src/create-logger.ts";
import {
  DEFAULT_REDACT_PATHS,
  mergeRedactPaths,
  REDACT_CENSOR,
} from "../src/redact.ts";
import { createLogCapture } from "./helpers.ts";

describe("redact", () => {
  test("success: mergeRedactPaths dedupes defaults and extras", () => {
    const merged = mergeRedactPaths(["apiKey", "customSecret", "apiKey"]);

    expect(merged).toContain("apiKey");
    expect(merged).toContain("customSecret");
    expect(merged.filter((p) => p === "apiKey")).toHaveLength(1);
    expect(merged.length).toBeGreaterThanOrEqual(DEFAULT_REDACT_PATHS.length);
  });

  test("error path: sensitive fields are censored in log output", async () => {
    const capture = createLogCapture();
    const log = createLogger({
      level: "info",
      json: true,
      destination: capture.destination,
    });

    log.info(
      {
        apiKey: "sk-live-should-not-leak",
        authorization: "Bearer abc",
        password: "hunter2",
        safe: "visible",
      },
      "with secrets",
    );

    await log.flush();
    const lines = await capture.waitForLines(1);
    const line = lines[0];

    expect(line?.safe).toBe("visible");
    expect(line?.apiKey).toBe(REDACT_CENSOR);
    expect(line?.authorization).toBe(REDACT_CENSOR);
    expect(line?.password).toBe(REDACT_CENSOR);
    expect(JSON.stringify(line)).not.toContain("sk-live-should-not-leak");
    expect(JSON.stringify(line)).not.toContain("hunter2");
  });

  test("edge: custom redactPaths are applied", async () => {
    const capture = createLogCapture();
    const log = createLogger({
      level: "info",
      json: true,
      destination: capture.destination,
      redactPaths: ["playerEmail"],
    });

    log.info({ playerEmail: "a@b.c", ok: true }, "pii");

    await log.flush();
    const lines = await capture.waitForLines(1);

    expect(lines[0]?.playerEmail).toBe(REDACT_CENSOR);
    expect(lines[0]?.ok).toBe(true);
  });
});
