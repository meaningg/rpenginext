import { afterAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { FilesystemTraceSink } from "../src/tracing/filesystem-trace-sink.ts";

const tmpRoot = path.join(
  import.meta.dir,
  "..",
  ".tmp-test-traces",
  `run_${Date.now()}`,
);

afterAll(async () => {
  await rm(path.join(import.meta.dir, "..", ".tmp-test-traces"), {
    recursive: true,
    force: true,
  });
});

describe("FilesystemTraceSink", () => {
  test("writes markdown to disk and reports absolute path", async () => {
    const sink = new FilesystemTraceSink(tmpRoot);
    const relative = path.join(
      tmpRoot,
      "ses_test",
      "00001_trn_test_committed.md",
    );
    const body = "# Turn trace\n\nhello\n";
    const result = await sink.write(relative, body);
    expect(result.ok).toBe(true);

    const last = sink.last();
    expect(last?.path).toBe(path.resolve(relative));
    expect(last?.markdown).toBe(body);

    const file = Bun.file(last!.path);
    expect(await file.exists()).toBe(true);
    expect(await file.text()).toBe(body);
  });

  test("failure path returns error result on invalid path segment", async () => {
    // Use a path that cannot be created on Windows/Unix reliably: empty nested after root is fine;
    // instead force failure by writing through a file-as-directory if we first create a file.
    const blocker = path.join(tmpRoot, "blocked-as-file");
    await Bun.write(blocker, "not-a-dir");
    const sink = new FilesystemTraceSink(tmpRoot);
    const result = await sink.write(
      path.join(blocker, "child", "trace.md"),
      "# x\n",
    );
    expect(result.ok).toBe(false);
  });
});
