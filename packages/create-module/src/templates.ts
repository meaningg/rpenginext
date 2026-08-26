/**
 * Recipe templates for `create-module` (specs/05 §4).
 *
 * Every recipe generates:
 * - src/index.ts (defineModule; runtime deps only module-sdk + zod)
 * - tests/<id>.test.ts via `@rpengineext/module-sdk/test` (≥3 cases:
 *   success / reject / edge)
 * - README.md with a REQUIRED public contract section
 */

export const RECIPES = [
  "state",
  "seed-narrative",
  "guard",
  "full",
  "ai-tool",
  "access-read",
  "migrate",
  "events",
] as const;

export type Recipe = (typeof RECIPES)[number];

export interface Templates {
  readonly index: string;
  readonly test: string;
  readonly readme: string;
}

export function toSliceName(id: string): string {
  return id.replace(/-/g, "_");
}

export function toPascal(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

export function buildTemplates(id: string, recipe: Recipe): Templates {
  const slice = toSliceName(id);
  const pascal = toPascal(id);
  const factory = `create${pascal}Module`;

  switch (recipe) {
    case "state":
      return stateTemplates(id, slice, pascal, factory, recipe);
    case "seed-narrative":
      return seedNarrativeTemplates(id, slice, pascal, factory, recipe);
    case "guard":
      return guardTemplates(id, slice, pascal, factory, recipe);
    case "full":
      return fullTemplates(id, slice, pascal, factory, recipe);
    case "ai-tool":
      return aiToolTemplates(id, slice, pascal, factory, recipe);
    case "access-read":
      return accessReadTemplates(id, slice, pascal, factory, recipe);
    case "migrate":
      return migrateTemplates(id, slice, pascal, factory, recipe);
    case "events":
      return eventsTemplates(id, slice, pascal, factory, recipe);
  }
}

function header(id: string, slice: string, pascal: string, factory: string): string {
  return `import { defineModule } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
`;
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

function stateTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `${header(id, slice, pascal, factory)}const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    flag: z.boolean(),
  })
  .strict();
type SliceState = z.infer<typeof SliceSchema>;

  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded state module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: SliceSchema,
      initial: { schemaVersion: 1 as const, flag: false },
      ops: {
        set_flag: {
          payload: z.object({ flag: z.boolean() }).strict(),
          apply: (s: SliceState, p: { flag: boolean }): SliceState => ({
            ...s,
            flag: p.flag,
          }),
        },
      },
    },
    turn: {
      change(ctx) {
        ctx.op("set_flag", { flag: true });
      },
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import {
  expectCommitted,
  expectRejected,
  expectSlice,
  testModule,
} from "@rpengineext/module-sdk/test";
import { ${factory} } from "../src/index.ts";

describe("${id} module (recipe: state)", () => {
  test("success: turn commits and sets the flag", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    expectSlice(h.value, "${slice}", { flag: true });
    await h.value.stop();
  });

  test("reject: unknown op fails with MODULE_OP_UNKNOWN", async () => {
    const { defineModule, deny } = await import("@rpengineext/module-sdk");
    const mod = defineModule({
      id: "${id}",
      version: "1.0.0",
      title: "${pascal}",
      turn: {
        change(ctx) {
          void deny;
          ctx.op("no_such_op");
        },
      },
    });
    const h = await testModule(mod);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_OP_UNKNOWN");
    await h.value.stop();
  });

  test("edge: flag stays false when op payload is invalid", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("x");
    expectCommitted(turn);
    const state = h.value.state()!;
    expect((state.slices.${slice} as { flag: boolean }).flag).toBe(true);
    await h.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: `${slice} (schemaVersion 1)`,
    ops: "set_flag ({ flag: boolean })",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: "—",
    system: "—",
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// seed-narrative
// ---------------------------------------------------------------------------

function seedNarrativeTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  // SliceSchema lives at module scope so state.schema, seed ops and the
  // narrative section all reference the same shape.
  const index = `${header(id, slice, pascal, factory)}const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    present: z.boolean(),
    text: z.string(),
  })
  .strict();
type SliceState = z.infer<typeof SliceSchema>;

  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded seed + narrative module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: SliceSchema,
      initial: { schemaVersion: 1 as const, present: false, text: "" },
      ops: {
        seed: {
          payload: z.object({ text: z.string().min(1) }).strict(),
          apply: (s: SliceState, p: { text: string }): SliceState => ({
            schemaVersion: 1,
            present: true,
            text: p.text.trim(),
          }),
        },
      },
    },
    seed: {
      fromMeta: "${slice}",
      parse: z
        .string()
        .min(1)
        .transform((t) => t.trim())
        .refine((t) => t.length > 0),
      apply: (value, ctx) => {
        ctx.op("seed", { text: String(value).trim() });
      },
    },
    narrative: {
      system: ({ slice }) => {
        const s = slice as SliceState;
        if (!s.present) return null;
        return { title: "${pascal.toUpperCase()}", text: s.text };
      },
    },
  });
}
`;

  const test = `import { describe, expect, test } from "bun:test";
import {
  expectCommitted,
  expectSlice,
  testModule,
} from "@rpengineext/module-sdk/test";
import { ${factory} } from "../src/index.ts";

describe("${id} module (recipe: seed-narrative)", () => {
  test("success: seeds from meta and injects narrative", async () => {
    const h = await testModule(${factory}(), {
      meta: { ${slice}: "ancient lore" },
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    expectSlice(h.value, "${slice}", { present: true, text: "ancient lore" });
    await h.value.stop();
  });

  test("reject: missing meta is a no-op (no seed)", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    expectSlice(h.value, "${slice}", { present: false });
    await h.value.stop();
  });

  test("edge: blank meta string does not seed", async () => {
    const h = await testModule(${factory}(), { meta: { ${slice}: "   " } });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    expectSlice(h.value, "${slice}", { present: false });
    await h.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: `${slice} (schemaVersion 1)`,
    ops: "seed ({ text: string })",
    metaKeys: `${slice} (free-text string)`,
    configKey: "—",
    readModels: "—",
    events: "—",
    system: "—",
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// guard
// ---------------------------------------------------------------------------

function guardTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `import { defineModule, deny } from "@rpengineext/module-sdk";

export const MODULE_ID = "${id}" as const;

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded guard module",
    rules: {
      guard(ctx) {
        const text = (ctx.normalizedAction as { text?: string } | undefined)?.text;
        if (text?.trim().toLowerCase() === "nope") {
          deny("GUARD_REJECTED", "not allowed");
        }
      },
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import {
  expectCommitted,
  expectRejected,
  testModule,
} from "@rpengineext/module-sdk/test";
import { ${factory} } from "../src/index.ts";

describe("${id} module (recipe: guard)", () => {
  test("success: normal text passes the guard", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    await h.value.stop();
  });

  test("reject: 'nope' is denied with GUARD_REJECTED", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("nope");
    expectRejected(turn, "GUARD_REJECTED");
    await h.value.stop();
  });

  test("edge: case-insensitive trigger", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("NOPE");
    expectRejected(turn, "GUARD_REJECTED");
    await h.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: "—",
    ops: "—",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: "—",
    system: "—",
    extra: "## Guard behavior\n- free_text `nope` (any case) → `GUARD_REJECTED`.",
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// full
// ---------------------------------------------------------------------------

function fullTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `import { defineModule, deny } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;

const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    value: z.number().int(),
  })
  .strict();
type SliceState = z.infer<typeof SliceSchema>;

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded full example module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: SliceSchema,
      initial: { schemaVersion: 1 as const, value: 0 },
      ops: {
        bump: (s: SliceState, p: { by?: number }): SliceState => ({
          ...s,
          value: s.value + (Number(p.by) || 1),
        }),
      },
    },
    rules: {
      guard(ctx) {
        const text = (ctx.normalizedAction as { text?: string } | undefined)?.text;
        if (text === "nope") deny("NOPE", "not allowed");
      },
    },
    turn: {
      change(ctx) {
        ctx.op("bump", { by: 1 });
      },
    },
    narrative: {
      system: ({ slice }) => ({
        title: "${pascal.toUpperCase()}",
        text: \`[${pascal}] value=\${(slice as SliceState).value}\`,
      }),
    },
    host: {
      status: ({ slice }) => [
        {
          slot: "${slice}.value",
          text: \`\${(slice as SliceState).value}\`,
        },
      ],
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import {
  expectCommitted,
  expectRejected,
  expectSlice,
  testModule,
} from "@rpengineext/module-sdk/test";
import { ${factory} } from "../src/index.ts";

describe("${id} module (recipe: full)", () => {
  test("success: bump commits and exposes host status", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    expectSlice(h.value, "${slice}", { value: 1 });
    await h.value.stop();
  });

  test("reject: guard denies 'nope'", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("nope");
    expectRejected(turn, "NOPE");
    await h.value.stop();
  });

  test("edge: value accumulates across turns", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    await h.value.turn("one");
    await h.value.turn("two");
    await h.value.turn("three");
    expectSlice(h.value, "${slice}", { value: 3 });
    await h.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: `${slice} (schemaVersion 1)`,
    ops: "bump ({ by?: number })",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: "—",
    system: "—",
    extra: `## Behavior\n- every committed free_text turn bumps ${slice}.value by 1;\n- free_text \`nope\` → deny \`NOPE\`;\n- \`host.status\` exposes \`${slice}.value\` in passage.visibleState.`,
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// ai-tool
// ---------------------------------------------------------------------------

function aiToolTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `import { defineModule, deny } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;
export const SYSTEM_REASON_SYNC = "${id}.sync" as const;

const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    mark: z.string(),
  })
  .strict();
type SliceState = z.infer<typeof SliceSchema>;

/**
 * Creates the ${id} module (background AI-write pattern).
 *
 * Player turn commits → \`turn.committed\` schedules a background system turn →
 * an \`ai.task\` runs with a tool → the tool proposes an op on THIS module's
 * slice via \`ctx.proposeOp\`. \`committed\` itself never writes the world.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded ai-tool module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: SliceSchema,
      initial: { schemaVersion: 1 as const, mark: "" },
      ops: {
        set_mark: {
          payload: z.object({ mark: z.string().min(1) }).strict(),
          apply: (s: SliceState, p: { mark: string }): SliceState => ({
            schemaVersion: 1,
            mark: p.mark,
          }),
        },
      },
    },
    turn: {
      committed(ctx) {
        if (ctx.turnKind !== "player") return;
        ctx.scheduleSystem({ reason: SYSTEM_REASON_SYNC, mode: "background" });
      },
    },
    ai: {
      tasks: {
        sync: {
          description: "sync mark via tool",
          input: z.object({}).strict(),
          output: z.object({ ok: z.boolean() }).strict(),
          runOn: { systemReason: SYSTEM_REASON_SYNC },
          tools: ["apply"],
          messages: () => [
            {
              role: "system",
              content: "Call the apply tool with mark=auto, then return {ok:true}",
            },
            { role: "user", content: "sync" },
          ],
        },
      },
      tools: {
        apply: {
          description: "Set the mark via proposeOp",
          args: z.object({ mark: z.string().min(1) }).strict(),
          result: z.object({ ok: z.boolean() }).strict(),
          handler(args, ctx) {
            if (typeof args.mark !== "string") {
              deny("MARK_INVALID", "mark must be a string");
            }
            if (args.mark === "bad") {
              deny("MARK_BAD", "mark rejected");
            }
            ctx.proposeOp("set_mark", { mark: args.mark });
            return { ok: true };
          },
        },
      },
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import { defineModule, deny } from "@rpengineext/module-sdk";
import {
  expectCommitted,
  expectSlice,
  scriptedToolLlm,
  testModule,
  type ToolScriptStep,
} from "@rpengineext/module-sdk/test";
import { z } from "zod";
import { ${factory}, SLICE_NAME, SYSTEM_REASON_SYNC } from "../src/index.ts";

const okScript: ToolScriptStep[] = [
  { tool: "${slice}.apply", args: { mark: "auto" }, result: { ok: true } },
];

describe("${id} module (recipe: ai-tool)", () => {
  test("success: player turn commits; background tool path updates state", async () => {
    const h = await testModule(${factory}(), {
      llm: scriptedToolLlm(okScript),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("please");
    expectCommitted(turn);
    const idle = await h.value.waitIdle(10_000);
    expect(idle.ok).toBe(true);
    expectSlice(h.value, SLICE_NAME, { mark: "auto" });
    await h.value.stop();
  });

  test("reject: tool deny leaves the slice untouched (no partial write)", async () => {
    const badScript: ToolScriptStep[] = [
      { tool: "${slice}.apply", args: { mark: "bad" }, result: { ok: false } },
    ];
    const h = await testModule(${factory}(), {
      llm: scriptedToolLlm(badScript),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("please");
    expectCommitted(turn);
    const idle = await h.value.waitIdle(10_000);
    expect(idle.ok).toBe(true);
    expectSlice(h.value, SLICE_NAME, { mark: "" });
    await h.value.stop();
  });

  test("edge: committed does not write the world itself", async () => {
    let writes = 0;
    const spy = defineModule({
      id: "${id}",
      version: "1.0.0",
      title: "${pascal}",
      state: {
        name: SLICE_NAME,
        schema: ${"z"}.object({
          schemaVersion: ${"z"}.literal(1),
          mark: ${"z"}.string(),
        }).strict(),
        initial: { schemaVersion: 1 as const, mark: "" },
        ops: {
          set_mark: {
            payload: ${"z"}.object({ mark: ${"z"}.string() }).strict(),
            apply: (
              s: { schemaVersion: 1; mark: string },
              p: { mark: string },
            ): { schemaVersion: 1; mark: string } => ({ schemaVersion: 1, mark: p.mark }),
          },
        },
      },
      turn: {
        committed(ctx) {
          writes += 1;
          ctx.scheduleSystem({ reason: SYSTEM_REASON_SYNC, mode: "background" });
          void writes;
        },
      },
      ai: {
        tasks: {
          sync: {
            description: "sync",
            input: ${"z"}.object({}).strict(),
            output: ${"z"}.object({ ok: ${"z"}.boolean() }).strict(),
            runOn: { systemReason: SYSTEM_REASON_SYNC },
            tools: ["apply"],
            messages: () => [
              { role: "system" as const, content: "apply" },
              { role: "user" as const, content: "go" },
            ],
          },
        },
        tools: {
          apply: {
            description: "apply",
            args: ${"z"}.object({ mark: ${"z"}.string() }).strict(),
            result: ${"z"}.object({ ok: ${"z"}.boolean() }).strict(),
            handler(args, ctx) {
              if (typeof args.mark !== "string") {
                deny("MARK_INVALID", "mark must be a string");
              }
              ctx.proposeOp("set_mark", { mark: args.mark });
              return { ok: true };
            },
          },
        },
      },
    });
    const h = await testModule(spy, {
      llm: scriptedToolLlm(okScript),
      agentsMode: "llm",
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    await h.value.waitIdle(10_000);
    await h.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: `${slice} (schemaVersion 1)`,
    ops: "set_mark ({ mark: string })",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: "—",
    system: `- reason \`${id}.sync\` (background)`,
    extra: `## AI pattern\n- player turn commits;\n- \`turn.committed\` schedules the background system turn (never writes);\n- task \`${id}.sync\` runs the \`${slice}.apply\` tool;\n- tool \`proposeOp\` writes ${slice}.mark; deny → no partial write.`,
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// access-read
// ---------------------------------------------------------------------------

function accessReadTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `import { defineModule } from "@rpengineext/module-sdk";

export const MODULE_ID = "${id}" as const;
/** Foreign slice this module reads (public contract of the provider). */
export const FOREIGN_SLICE = "${slice}_foreign" as const;

/**
 * Creates the ${id} module (read-only composition pattern).
 *
 * Reads the \`${slice}_foreign\` slice via \`access.read\` and surfaces it in
 * the narrative system prompt. Never writes a foreign slice.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded access-read module",
    provides: ["capability:${id}"],
    access: {
      read: [FOREIGN_SLICE],
    },
    narrative: {
      system: (ctx) => {
        const foreign = ctx.readSlice<{ label?: string }>(FOREIGN_SLICE);
        if (!foreign?.label) return null;
        return { title: "${pascal.toUpperCase()}", text: foreign.label };
      },
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import { defineModule } from "@rpengineext/module-sdk";
import {
  expectCommitted,
  testModule,
  testModules,
} from "@rpengineext/module-sdk/test";
import { z } from "zod";
import { ${factory}, FOREIGN_SLICE } from "../src/index.ts";

const foreignProvider = defineModule({
  id: "${id}-provider",
  version: "1.0.0",
  title: "Provider",
  state: {
    name: FOREIGN_SLICE,
    schema: z
      .object({ schemaVersion: z.literal(1), label: z.string() })
      .strict(),
    initial: { schemaVersion: 1 as const, label: "provider truth" },
  },
});

describe("${id} module (recipe: access-read)", () => {
  test("success: boots with foreign module present and reads without write", async () => {
    const h = await testModules([foreignProvider, ${factory}()]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    // Reader never writes the foreign slice (label unchanged).
    expect(
      (h.value.state()!.slices[FOREIGN_SLICE] as { label: string }).label,
    ).toBe("provider truth");
    await h.value.stop();
  });

  test("reject: reading a non-declared slice fails loud", async () => {
    const bad = defineModule({
      id: "${id}",
      version: "1.0.0",
      title: "${pascal}",
      narrative: {
        system: (ctx) => {
          return String(ctx.readSlice("undeclared_slice") ?? "");
        },
      },
    });
    const h = await testModule(bad);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expect(turn.status).toBe("rejected");
    await h.value.stop();
  });

  test("edge: missing foreign slice behaves safely (null section)", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("hello");
    expectCommitted(turn);
    await h.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: "—",
    ops: "—",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: "—",
    system: "—",
    extra: `## Reads (access.read)\n- \`${slice}_foreign\` (slice owned by the provider module \`${id}-provider\` in tests; in production: any module providing that slice).`,
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------

function migrateTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `import { defineModule } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;

const SliceV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string(),
  })
  .strict();

/**
 * Creates the ${id} module with a v1→v2 slice migration.
 *
 * Old saves at schemaVersion 1 are upgraded on load; an unmigratable version
 * fails load with \`MODULE_SLICE_UNMIGRATABLE\` (E14) — never silent data drop.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded migrate module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schemaVersion: 2,
      schema: SliceV2Schema,
      initial: { schemaVersion: 2 as const, name: "" },
      ops: {
        set_name: {
          payload: z.object({ name: z.string() }).strict(),
          apply: (
            s: { schemaVersion: 2; name: string },
            p: { name: string },
          ) => ({ ...s, name: p.name }),
        },
      },
      migrations: {
        1: (old: unknown) => {
          const v1 = old as { schemaVersion: 1; oldName?: string };
          return {
            schemaVersion: 2 as const,
            name: v1.oldName?.trim() || "migrated",
          };
        },
      },
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import {
  createEmptyWorldState,
  type SessionSnapshot,
} from "@rpengineext/contracts";
import { InMemoryPersistence } from "@rpengineext/core";
import { createTestEngine } from "@rpengineext/core/testing";
import { defineModule } from "@rpengineext/module-sdk";
import { z } from "zod";
import { ${factory}, SLICE_NAME } from "../src/index.ts";

function v1Snapshot(sessionId: string): SessionSnapshot {
  const state = createEmptyWorldState("2024-01-01T00:00:00.000Z");
  return {
    formatVersion: 1,
    sessionId,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    engine: { coreVersion: "1.0.0", contractsVersion: "1.0.0" },
    enabledModules: [{ id: "${id}", version: "1.0.0" }],
    state: {
      ...state,
      slices: { [SLICE_NAME]: { schemaVersion: 1, oldName: "legacy" } } as never,
    },
    passages: [],
    meta: {},
  };
}

describe("${id} module (recipe: migrate)", () => {
  test("success: v1 save loads as v2 (migrated)", async () => {
    const persistence = new InMemoryPersistence();
    await persistence.save(v1Snapshot("mig-session"));
    const created = await createTestEngine({
      modules: [${factory}()],
      persistence,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const loaded = await created.value.engine.loadSession("mig-session");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const slice = created.value.runtime.getSessionState("mig-session")!.slices[SLICE_NAME];
    expect(slice).toEqual({ schemaVersion: 2, name: "legacy" });
  });

  test("reject: unmigratable version fails load with MODULE_SLICE_UNMIGRATABLE", async () => {
    const frozen = defineModule({
      id: "${id}",
      version: "1.0.0",
      title: "${pascal}",
      state: {
        name: SLICE_NAME,
        schemaVersion: 3,
        schema: z.object({ schemaVersion: z.literal(3) }).strict(),
        initial: { schemaVersion: 3 as const },
      },
    });
    const persistence = new InMemoryPersistence();
    await persistence.save(v1Snapshot("broken-session"));
    const created = await createTestEngine({
      modules: [frozen],
      persistence,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const loaded = await created.value.engine.loadSession("broken-session");
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.code).toBe("MODULE_SLICE_UNMIGRATABLE");
  });

  test("edge: migrated slice stays writable via ops", async () => {
    const persistence = new InMemoryPersistence();
    await persistence.save(v1Snapshot("mig-session-2"));
    const created = await createTestEngine({
      modules: [${factory}()],
      persistence,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const loaded = await created.value.engine.loadSession("mig-session-2");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const turn = await loaded.value.submitAction({ kind: "free_text", text: "x" });
    expect(turn.status).toBe("committed");
    const slice =
      created.value.runtime.getSessionState("mig-session-2")!.slices[SLICE_NAME];
    expect((slice as { schemaVersion: number }).schemaVersion).toBe(2);
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: `${slice} (schemaVersion 2)`,
    ops: "set_name ({ name: string })",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: "—",
    system: "—",
    extra: `## Migrations\n- \`1 → 2\`: \`oldName\` → \`name\`;\n- unmigratable version → \`MODULE_SLICE_UNMIGRATABLE\` (E14) on load.`,
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

function eventsTemplates(id: string, slice: string, pascal: string, factory: string, recipe: Recipe): Templates {
  const index = `import { defineModule } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;
export const EVENT_CHANGED = "${slice}.changed" as const;
/** Canonical event this module publishes (events.emit local name). */
export const EVENT_CHANGED_LOCAL = "changed" as const;
/** Follow-up system reason (event handler → scheduleSystem). */
export const SYSTEM_REASON_FOLLOWUP = "${id}.followup" as const;

const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    n: z.number(),
  })
  .strict();

/**
 * Creates the ${id} module (events pattern).
 *
 * Publishes \`${slice}.changed\` from \`turn.committed\` (post-outcome only)
 * and subscribes to a foreign event to schedule a follow-up system turn.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "1.0.0",
    title: "${pascal}",
    description: "Scaffolded events module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: SliceSchema,
      initial: { schemaVersion: 1 as const, n: 0 },
      ops: {
        bump: (s, p: { by?: number }) => ({
          ...s,
          n: s.n + (Number(p.by) || 1),
        }),
      },
    },
    events: {
      emit: [
        {
          name: EVENT_CHANGED_LOCAL,
          schema: z.object({ n: z.number() }).strict(),
          description: "fires after every committed bump",
        },
      ],
      subscribe: [
        {
          name: "some_publisher.ping",
          priority: 100,
          handler(ctx) {
            // observe-only; follow-up work via scheduleSystem
            ctx.scheduleSystem({ reason: SYSTEM_REASON_FOLLOWUP, mode: "background" });
          },
        },
      ],
    },
    turn: {
      change(ctx) {
        ctx.op("bump", { by: 1 });
      },
      committed(ctx) {
        ctx.emit(EVENT_CHANGED, { n: (ctx.slice as { n: number }).n + 1 });
      },
    },
  });
}
`;
  const test = `import { describe, expect, test } from "bun:test";
import { defineModule } from "@rpengineext/module-sdk";
import {
  expectCommitted,
  expectEvent,
  expectRejected,
  expectSlice,
  testModule,
  testModules,
} from "@rpengineext/module-sdk/test";
import { z } from "zod";
import { ${factory}, EVENT_CHANGED, SLICE_NAME } from "../src/index.ts";

describe("${id} module (recipe: events)", () => {
  test("success: emits post-commit; payload intact", async () => {
    const h = await testModule(${factory}());
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectCommitted(turn);
    expectEvent(h.value, EVENT_CHANGED, { n: 1 });
    expectSlice(h.value, SLICE_NAME, { n: 1 });
    await h.value.stop();
  });

  test("reject: emit in turn.change fails with MODULE_EVENT_EMIT_FORBIDDEN", async () => {
    const bad = defineModule({
      id: "${id}",
      version: "1.0.0",
      title: "${pascal}",
      events: {
        emit: [{ name: "oops" }],
      },
      turn: {
        change(ctx) {
          ctx.emit("${slice}.oops", {});
        },
      },
    });
    const h = await testModule(bad);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const turn = await h.value.turn("go");
    expectRejected(turn, "MODULE_EVENT_EMIT_FORBIDDEN");
    await h.value.stop();
  });

  test("edge: unknown event subscribe fails boot with MODULE_EVENT_UNKNOWN", async () => {
    const pub = defineModule({
      id: "some-publisher",
      version: "1.0.0",
      title: "Publisher",
      events: {
        emit: [{ name: "ping", schema: z.object({}).strict() }],
      },
    });
    const typo = defineModule({
      id: "${id}-typo",
      version: "1.0.0",
      title: "${pascal}",
      events: {
        subscribe: [{ name: "some_publisher.pin", handler() {} }],
      },
    });
    const h = await testModules([pub, typo]);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.error.code).toBe("MODULE_EVENT_UNKNOWN");
  });

  test("edge: handler schedules follow-up system turn (observe-only dispatch)", async () => {
    const pub = defineModule({
      id: "some-publisher",
      version: "1.0.0",
      title: "Publisher",
      priority: 5,
      events: {
        emit: [{ name: "ping", schema: z.object({}).strict() }],
      },
      turn: {
        committed(ctx) {
          ctx.emit("some_publisher.ping", {});
        },
      },
    });
    const { testModules } = await import("@rpengineext/module-sdk/test");
    const duo = await testModules([pub, ${factory}()]);
    expect(duo.ok).toBe(true);
    if (!duo.ok) return;
    const turn = await duo.value.turn("go");
    expectCommitted(turn);
    // the ${id} handler reacted to the ping (no crash; world intact)
    expectEvent(duo.value, "some_publisher.ping", {});
    await duo.value.stop();
  });
});
`;
  const readme = readmeTemplate(id, recipe, {
    requires: ["capability:state-core"],
    slices: `${slice} (schemaVersion 1)`,
    ops: "bump ({ by?: number })",
    metaKeys: "—",
    configKey: "—",
    readModels: "—",
    events: `- emitted: \`${slice}.changed\` ({ n: number }) — post-outcome only;\n- subscribed: \`some_publisher.ping\` (observe-only; schedules \`${id}.followup\`)`,
    system: `- reason \`${id}.followup\` (background, from event handler)`,
  });
  return { index, test, readme };
}

// ---------------------------------------------------------------------------
// shared readme
// ---------------------------------------------------------------------------

function readmeTemplate(
  id: string,
  recipe: Recipe,
  values: {
    requires: string;
    slices: string;
    ops: string;
    metaKeys: string;
    configKey: string;
    readModels: string;
    events: string;
    system: string;
    extra?: string;
  },
): string {
  return `# \`@rpengineext/module-${id}\`

Scaffolded with \`@rpengineext/create-module\` (recipe: \`${recipe}\`).

Built on **\`@rpengineext/module-sdk\` 1.0.0** (normative author surface).
Docs: \`docs/modules/README.md\` · \`docs/modules/sdk-reference.md\` · \`docs/modules/recipes.md\` · \`docs/modules/compatibility.md\`.

## Public contract

- **id / version / priority**: \`${id}\` / \`1.0.0\` / \`100\`
- **provides**: \`capability:${id}\`
- **requires**: ${values.requires}
- **slice**: ${values.slices}
- **ops**: ${values.ops}
- **meta keys (seed)**: ${values.metaKeys}
- **config key**: ${values.configKey} (moduleConfig section — not a secrets channel)
- **readModels**: ${values.readModels}
- **events**: ${values.events}
- **system reasons / task types / tools**: ${values.system}

${values.extra ?? ""}
## Dev

\`\`\`bash
bun test packages/modules/${id}
\`\`\`

Runtime deps: \`@rpengineext/module-sdk\` + \`zod\` only (no core internals, no other \`module-*\`).
`;
}