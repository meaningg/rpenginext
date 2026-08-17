import { describe, expect, test } from "bun:test";

import { createLogger } from "../src/create-logger.ts";
import { createLogCapture } from "./helpers.ts";

describe("createLogger", () => {
  test("success: writes info message with root and child bindings", async () => {
    const capture = createLogCapture();
    const root = createLogger({
      name: "test-app",
      level: "debug",
      json: true,
      destination: capture.destination,
      bindings: { component: "core" },
    });

    const turnLog = root.child({ turnId: "turn_1", sessionId: "sess_1" });
    turnLog.info({ stage: "guard" }, "guards passed");

    await root.flush();
    const lines = await capture.waitForLines(1);
    const line = lines[0];

    expect(line).toBeDefined();
    expect(line?.msg).toBe("guards passed");
    expect(line?.level).toBe(30);
    expect(line?.name).toBe("test-app");
    expect(line?.component).toBe("core");
    expect(line?.turnId).toBe("turn_1");
    expect(line?.sessionId).toBe("sess_1");
    expect(line?.stage).toBe("guard");
  });

  test("error path: level filter drops debug/info when level is error", async () => {
    const capture = createLogCapture();
    const log = createLogger({
      level: "error",
      json: true,
      destination: capture.destination,
    });

    log.debug("nope-debug");
    log.info("nope-info");
    log.warn("nope-warn");
    log.error("only-error");

    await log.flush();
    const lines = await capture.waitForLines(1);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.msg).toBe("only-error");
    expect(lines[0]?.level).toBe(50);
  });

  test("edge: string-only and object-only overloads emit", async () => {
    const capture = createLogCapture();
    const log = createLogger({
      level: "info",
      json: true,
      destination: capture.destination,
    });

    log.info("plain message");
    log.info({ answer: 42 });

    await log.flush();
    const lines = await capture.waitForLines(2);

    expect(lines[0]?.msg).toBe("plain message");
    expect(lines[1]?.answer).toBe(42);
  });

  test("edge: invalid env level throws TypeError", () => {
    expect(() =>
      createLogger({
        json: true,
        envLogLevel: "verbose",
      }),
    ).toThrow(TypeError);
  });

  test("edge: Error object is serialized under err", async () => {
    const capture = createLogCapture();
    const log = createLogger({
      level: "error",
      json: true,
      destination: capture.destination,
    });

    log.error(new Error("agent timeout"), "failed");

    await log.flush();
    const lines = await capture.waitForLines(1);
    const err = lines[0]?.err as { message?: string; type?: string } | undefined;

    expect(lines[0]?.msg).toBe("failed");
    expect(err?.message).toBe("agent timeout");
  });

  test("edge: pretty mode creates logger without throwing", () => {
    // Worker transport is intentionally avoided; sync pretty must boot on Bun.
    const log = createLogger({
      name: "pretty-smoke",
      level: "info",
      json: false,
    });
    const child = log.child({ component: "engine" });
    expect(log.level).toBe("info");
    expect(() => child.info({ sessionId: "s_1" }, "pretty smoke")).not.toThrow();
  });
});
