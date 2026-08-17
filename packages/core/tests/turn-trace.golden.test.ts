import { describe, expect, test } from "bun:test";

import { createTestEngine } from "../src/testing/create-test-engine.ts";
import { MockAgentScript } from "../src/agents/mock-agent-script.ts";
import { normalizeTraceMarkdown } from "../src/tracing/markdown-renderer.ts";

describe("TurnTracer golden", () => {
  test("committed trace has stable sections", async () => {
    const created = await createTestEngine({ includeFixtureHello: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession({ seed: "g1" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    await session.value.submitAction({ kind: "free_text", text: "hello" });
    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    const normalized = normalizeTraceMarkdown(md);

    expect(normalized).toContain("# Turn trace `trn_NORMALIZED`");
    expect(normalized).toContain("## Summary");
    expect(normalized).toContain("## Input");
    expect(normalized).toContain("## Timeline");
    expect(normalized).toContain("## Agents");
    expect(normalized).toContain("## Commands");
    expect(normalized).toContain("## State diff");
    expect(normalized).toContain("## Narrative");
    expect(normalized).toContain("## Passage");
    expect(normalized).toContain("## Persistence");
    expect(normalized).toContain("## Module notes");
    expect(normalized).toContain("## Warnings / errors");
    expect(normalized).toContain("outcome: **committed**");
    expect(normalized).toContain("narrative.write");
  });

  test("rejected agent trace includes rollback marker", async () => {
    const script = new MockAgentScript().fail(
      "narrative.write",
      "X",
      "boom",
    );
    const created = await createTestEngine({ mockAgentScript: script });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    await session.value.submitAction({ kind: "free_text", text: "hello" });
    const md = created.value.memoryTraceSink.last()?.markdown ?? "";
    expect(md).toContain("outcome: **rejected**");
    expect(md).toContain("ROLLBACK to revision");
    expect(md).toContain("## Agents");
  });
});
