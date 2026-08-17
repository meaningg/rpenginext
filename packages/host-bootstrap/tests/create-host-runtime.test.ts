import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createHostRuntime } from "../src/create-host-runtime.ts";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rp-host-"));
const dataDir = path.join(tmpRoot, "data");
const storiesDir = path.resolve(import.meta.dir, "../../../data/stories");

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("createHostRuntime", () => {
  test("boots mock engine and runs a turn", async () => {
    const created = await createHostRuntime({
      forceMock: true,
      loggerName: "host-bootstrap-test",
      env: {
        RP_DATA_DIR: dataDir,
        RP_STORIES_DIR: storiesDir,
        RP_LOG_LEVEL: "error",
        RP_AGENTS_MODE: "mock",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { engine, storyCatalog, stop } = created.value;
    expect(storyCatalog.get("demo.hello")).toBeTruthy();

    const session = await engine.startSession({ seed: "test" });
    expect(session.ok).toBe(true);
    if (!session.ok) {
      await stop();
      return;
    }

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(turn.status).toBe("committed");
    await stop();
  });
});
