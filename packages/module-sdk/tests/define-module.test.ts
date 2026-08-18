import { describe, expect, test } from "bun:test";

import { defineModule, deny } from "../src/index.ts";
import { z } from "zod";
import { createTestEngine } from "@rpengineext/core/testing";

describe("defineModule", () => {
  test("success: compiles guard + state + narrative module", async () => {
    const mod = defineModule({
      id: "mood",
      version: "1.0.0",
      title: "Mood",
      state: {
        schema: z
          .object({
            schemaVersion: z.literal(1),
            level: z.number().int(),
          })
          .strict(),
        initial: { schemaVersion: 1 as const, level: 0 },
        ops: {
          bump: (s, p: { by?: number }) => ({
            ...s,
            level: s.level + (Number(p.by) || 1),
          }),
        },
      },
      turn: {
        change(ctx) {
          ctx.op("bump", { by: 1 });
        },
      },
      rules: {
        guard(ctx) {
          if ((ctx.action as { text?: string } | undefined)?.text === "nope") {
            deny("NOPE", "not allowed");
          }
        },
      },
      narrative: {
        system: ({ slice }) => `Mood: ${(slice as { level: number }).level}`,
      },
    });

    expect(mod.manifest.id).toBe("mood");
    expect(mod.manifest.contributes).toContain("Guard");
    expect(mod.manifest.contributes).toContain("TransitionContributor");
    expect(mod.manifest.registers.some((r) => r.startsWith("slice:"))).toBe(
      true,
    );

    const created = await createTestEngine({ modules: [mod] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(turn.status).toBe("committed");
    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices.mood as { level: number };
    expect(slice.level).toBe(1);
  });

  test("error: guard deny rejects turn", async () => {
    const mod = defineModule({
      id: "gate",
      version: "1.0.0",
      title: "Gate",
      rules: {
        guard(ctx) {
          const text = (ctx.normalizedAction as { text?: string } | undefined)
            ?.text;
          if (text === "nope") deny("NOPE", "no");
        },
      },
    });
    const created = await createTestEngine({ modules: [mod] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "nope",
    });
    expect(turn.status).toBe("rejected");
  });

  test("edge: duplicate state capability fails at define time", () => {
    expect(() =>
      defineModule({
        id: "bad",
        version: "1.0.0",
        title: "Bad",
        capabilities: [
          {
            kind: "state",
            schema: z.object({ schemaVersion: z.literal(1) }).strict(),
            initial: { schemaVersion: 1 as const },
          },
          {
            kind: "state",
            schema: z.object({ schemaVersion: z.literal(1) }).strict(),
            initial: { schemaVersion: 1 as const },
          },
        ],
      }),
    ).toThrow(/at most one state/);
  });
});
