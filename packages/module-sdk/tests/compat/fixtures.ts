/**
 * Frozen external-author-style modules for compatibility CI.
 * Do not "fix" these to match internal refactors — if they break,
 * the public sdk contract broke (or needs a deliberate major).
 */
import { defineModule, deny } from "../../src/index.ts";
import { z } from "zod";
import type { JsonObject } from "@rpengineext/contracts";

/** seed + narrative system section */
export function createCompatSeedNarrativeModule() {
  return defineModule({
    id: "compat-seed-narrative",
    version: "1.0.0",
    title: "Compat Seed Narrative",
    priority: 40,
    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          present: z.boolean(),
          text: z.string(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, present: false, text: "" },
      ops: {
        seed: {
          payload: z.object({ text: z.string().min(1) }).strict(),
          apply: (
            _s: { schemaVersion: 1; present: boolean; text: string },
            p: { text: string },
          ) => ({
            schemaVersion: 1 as const,
            present: true,
            text: p.text.trim(),
          }),
        },
      },
    },
    seed: {
      fromMeta: "compatCanon",
      parse: z.string().min(1),
      apply: (text, ctx) => {
        ctx.op("seed", { text: String(text).trim() });
      },
    },
    narrative: {
      system: ({ slice }) => {
        const s = slice as { present: boolean; text: string };
        if (!s.present) return null;
        return {
          id: "compat.canon",
          title: "COMPAT CANON",
          text: s.text,
          priority: 5,
        };
      },
    },
  });
}

/** guard deny */
export function createCompatGuardModule() {
  return defineModule({
    id: "compat-guard",
    version: "1.0.0",
    title: "Compat Guard",
    priority: 5,
    rules: {
      guard(ctx) {
        const text = (
          ctx.normalizedAction as { text?: string } | undefined
        )?.text?.trim();
        if (text === "forbidden-compat") {
          deny("COMPAT_FORBIDDEN", "compat guard blocked this");
        }
      },
    },
  });
}

/** afterProse append-like counter */
export function createCompatAfterProseModule() {
  return defineModule({
    id: "compat-after-prose",
    version: "1.0.0",
    title: "Compat After Prose",
    priority: 50,
    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          pairs: z.number().int(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, pairs: 0 },
      ops: {
        inc: (s) => ({ ...s, pairs: s.pairs + 1 }),
      },
    },
    turn: {
      afterProse(ctx) {
        if (ctx.turnKind !== "player") return;
        if (ctx.action?.kind !== "free_text") return;
        if (!ctx.passage?.prose.trim()) return;
        ctx.op("inc", {});
      },
    },
  });
}

/** host status */
export function createCompatHostModule() {
  return defineModule({
    id: "compat-host",
    version: "1.0.0",
    title: "Compat Host",
    priority: 60,
    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          label: z.string(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, label: "compat" },
    },
    host: {
      status: ({ slice }) => [
        {
          slot: "compat.label",
          text: `Compat: ${(slice as { label: string }).label}`,
        },
      ],
      help: [{ id: "compat", body: "compat help topic" }],
    },
  });
}

/** config + change uses config */
export function createCompatConfigModule() {
  return defineModule(
    {
      id: "compat-config",
      version: "1.0.0",
      title: "Compat Config",
      priority: 55,
      config: {
        key: "compat_config",
        schema: z
          .object({ step: z.number().int().positive() })
          .strict() as unknown as z.ZodType<JsonObject>,
        defaults: { step: 2 } as JsonObject,
      },
      state: {
        schema: z
          .object({
            schemaVersion: z.literal(1),
            total: z.number().int(),
          })
          .strict(),
        initial: { schemaVersion: 1 as const, total: 0 },
        ops: {
          add: {
            payload: z.object({ by: z.number().int() }).strict(),
            apply: (
              s: { schemaVersion: 1; total: number },
              p: { by: number },
            ) => ({
              ...s,
              total: s.total + p.by,
            }),
          },
        },
      },
      turn: {
        change(ctx) {
          const step = Number((ctx.config as { step?: number }).step ?? 2);
          ctx.op("add", { by: step });
        },
      },
    },
    { factoryConfig: { step: 3 } as JsonObject },
  );
}

/** tool proposeOp → state via foundation proposal protocol */
export function createCompatToolModule() {
  return defineModule({
    id: "compat-tool",
    version: "1.0.0",
    title: "Compat Tool",
    priority: 45,
    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          mark: z.string(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, mark: "" },
      ops: {
        set_mark: {
          payload: z.object({ mark: z.string().min(1) }).strict(),
          apply: (
            s: { schemaVersion: 1; mark: string },
            p: { mark: string },
          ) => ({ ...s, mark: p.mark }),
        },
      },
    },
    ai: {
      tasks: {
        apply_mark: {
          description: "system task that may call set_mark tool",
          input: z
            .object({ want: z.string() })
            .strict() as unknown as z.ZodType<JsonObject>,
          output: z
            .object({ ok: z.boolean() })
            .strict() as unknown as z.ZodType<JsonObject>,
          optional: true,
          tools: ["set_mark"],
          runOn: { systemReason: "compat.tool_sync" },
          messages: (input) => [
            {
              role: "system",
              content: "Call set_mark tool with the want string, then JSON {ok:true}",
            },
            { role: "user", content: JSON.stringify(input) },
          ],
        },
      },
      tools: {
        set_mark: {
          description: "Set mark via proposeOp",
          args: z
            .object({ mark: z.string().min(1) })
            .strict() as unknown as z.ZodType<JsonObject>,
          result: z
            .object({ ok: z.literal(true) })
            .strict() as unknown as z.ZodType<JsonObject>,
          handler: (args, ctx) => {
            ctx.proposeOp("set_mark", { mark: String(args.mark) });
            return { ok: true as const };
          },
        },
      },
    },
    turn: {
      committed(ctx) {
        if (ctx.turnKind !== "player") return;
        if (ctx.action?.kind !== "free_text") return;
        ctx.scheduleSystem({
          reason: "compat.tool_sync",
          mode: "inline",
          payload: { want: "from-tool" },
        });
      },
    },
  });
}

/** schedule system turn only */
export function createCompatScheduleModule() {
  return defineModule({
    id: "compat-schedule",
    version: "1.0.0",
    title: "Compat Schedule",
    priority: 70,
    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          scheduled: z.number().int(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, scheduled: 0 },
      ops: {
        tick: (s) => ({ ...s, scheduled: s.scheduled + 1 }),
      },
    },
    turn: {
      committed(ctx) {
        if (ctx.turnKind !== "player") return;
        ctx.scheduleSystem({
          reason: "compat.schedule_tick",
          mode: "inline",
        });
      },
      change(ctx) {
        if (ctx.turnKind === "system" && ctx.action?.kind === "system") {
          if (ctx.action.text === "compat.schedule_tick") {
            ctx.op("tick", {});
          }
        }
      },
    },
  });
}
