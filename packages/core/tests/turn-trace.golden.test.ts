import { describe, expect, test } from "bun:test";

import { createTestEngine } from "../src/testing/create-test-engine.ts";
import { MockAgentScript } from "../src/agents/mock-agent-script.ts";
import { normalizeTraceMarkdown } from "../src/tracing/markdown-renderer.ts";
import { diffWorldState } from "../src/util/state-diff.ts";
import {
  createEmptyWorldState,
  type WorldState,
} from "@rpengineext/contracts";

describe("TurnTracer golden", () => {
  test("committed trace has stable sections and narrative system prompt", async () => {
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
    expect(normalized).toContain("traceFormatVersion: `2`");
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
    expect(normalized).toContain("#### LLM transcript");
    expect(normalized).toContain('role="system"');
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

  test("state diff does not dump full working_memory history twice", () => {
    const base = createEmptyWorldState("t0");
    const before: WorldState = {
      ...base,
      slices: {
        working_memory: {
          entries: [
            { turnId: "trn_a", user: "u1", assistant: "a1" },
            { turnId: "trn_b", user: "u2", assistant: "a2" },
          ],
        },
      },
    };
    const after: WorldState = {
      ...before,
      meta: { ...before.meta, revision: before.meta.revision + 1 },
      slices: {
        working_memory: {
          entries: [
            { turnId: "trn_a", user: "u1", assistant: "a1" },
            { turnId: "trn_b", user: "u2", assistant: "a2" },
            { turnId: "trn_c", user: "u3", assistant: "a3-long".repeat(20) },
          ],
        },
      },
    };
    const diff = diffWorldState(before, after);
    const joined = JSON.stringify(diff);
    expect(joined).toContain("working_memory.entries[+trn_c]");
    expect(joined).toContain("working_memory.entries(summary)");
    // Must not embed the entire previous history as before/after blobs
    expect(joined.match(/trn_a/g)?.length ?? 0).toBeLessThan(4);
    expect(joined).not.toContain('"user":"u1","assistant":"a1"');
  });
});
