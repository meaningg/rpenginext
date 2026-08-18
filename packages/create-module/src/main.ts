#!/usr/bin/env bun
/**
 * Scaffold a product module on @rpengineext/module-sdk (CBMD).
 *
 * Usage:
 *   bun run packages/create-module/src/main.ts <module-id> [--recipe seed-narrative|state|guard|full]
 *   bun run create-module <module-id>
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const RECIPES = ["state", "seed-narrative", "guard", "full"] as const;
type Recipe = (typeof RECIPES)[number];

function printHelp(): void {
  console.log(`create-rp-module <module-id> [--recipe ${RECIPES.join("|")}]

Scaffolds packages/modules/<id> using @rpengineext/module-sdk.

Examples:
  bun run create-module mood
  bun run create-module lore --recipe seed-narrative

Docs: docs/modules/README.md · docs/modules/sdk-reference.md
`);
}

function toSliceName(id: string): string {
  return id.replace(/-/g, "_");
}

function toPascal(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function packageJson(id: string): string {
  return `${JSON.stringify(
    {
      name: `@rpengineext/module-${id}`,
      version: "0.1.0",
      private: true,
      type: "module",
      description: `rpengineext module ${id} (module-sdk)`,
      exports: { ".": "./src/index.ts" },
      scripts: {
        test: "bun test",
        typecheck: "bunx tsc --noEmit -p tsconfig.json",
      },
      dependencies: {
        "@rpengineext/module-sdk": "workspace:*",
        zod: "^4.4.3",
      },
      devDependencies: {
        "@rpengineext/core": "workspace:*",
        "@types/bun": "latest",
        typescript: "^5",
      },
      engines: { bun: ">=1.1.0" },
    },
    null,
    2,
  )}\n`;
}

function tsconfig(): string {
  return `{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "composite": false,
    "rootDir": ".",
    "types": ["bun"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
`;
}

function indexSource(id: string, recipe: Recipe): string {
  const slice = toSliceName(id);
  const pascal = toPascal(id);
  const factory = `create${pascal}Module`;

  if (recipe === "guard") {
    return `import { defineModule, deny } from "@rpengineext/module-sdk";

export const MODULE_ID = "${id}" as const;

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "0.1.0",
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
  }

  if (recipe === "seed-narrative") {
    return `import { defineModule } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;

const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    present: z.boolean(),
    text: z.string(),
  })
  .strict();

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "0.1.0",
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
          apply: (_s, p: { text: string }) => ({
            schemaVersion: 1 as const,
            present: true,
            text: p.text.trim(),
          }),
        },
      },
    },
    seed: {
      fromMeta: "${slice}",
      parse: z.string().min(1),
      apply: (text, ctx) => {
        ctx.op("seed", { text: String(text).trim() });
      },
    },
    narrative: {
      system: ({ slice }) => {
        const s = slice as z.infer<typeof SliceSchema>;
        if (!s.present) return null;
        return { title: "${pascal.toUpperCase()}", text: s.text };
      },
    },
  });
}
`;
  }

  if (recipe === "full") {
    return `import { defineModule, deny } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;

const SliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    value: z.number().int(),
  })
  .strict();

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "0.1.0",
    title: "${pascal}",
    description: "Scaffolded full example module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: SliceSchema,
      initial: { schemaVersion: 1 as const, value: 0 },
      ops: {
        bump: (s, p: { by?: number }) => ({
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
      system: ({ slice }) =>
        \`[${pascal}] value=\${(slice as z.infer<typeof SliceSchema>).value}\`,
    },
    host: {
      status: ({ slice }) => [
        {
          slot: "${slice}.value",
          text: \`\${(slice as z.infer<typeof SliceSchema>).value}\`,
        },
      ],
    },
  });
}
`;
  }

  // state (default)
  return `import { defineModule } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "${id}" as const;
export const SLICE_NAME = "${slice}" as const;

/**
 * Creates the ${id} module.
 */
export function ${factory}() {
  return defineModule({
    id: MODULE_ID,
    version: "0.1.0",
    title: "${pascal}",
    description: "Scaffolded state module",
    provides: ["capability:${id}"],
    state: {
      name: SLICE_NAME,
      schema: z
        .object({
          schemaVersion: z.literal(1),
          flag: z.boolean(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, flag: false },
      ops: {
        set_flag: {
          payload: z.object({ flag: z.boolean() }).strict(),
          apply: (s, p: { flag: boolean }) => ({ ...s, flag: p.flag }),
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
}

function testSource(id: string): string {
  const pascal = toPascal(id);
  const factory = `create${pascal}Module`;
  return `import { describe, expect, test } from "bun:test";
import { createTestEngine } from "@rpengineext/core/testing";

import { ${factory} } from "../src/index.ts";

describe("${id} module", () => {
  test("success: boots and commits a turn", async () => {
    const created = await createTestEngine({
      modules: [${factory}()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.registry.getModules().some((m) => m.module.ir)).toBe(
      true,
    );
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(turn.status === "committed" || turn.status === "rejected").toBe(
      true,
    );
  });

  test("error: define exposes IR", () => {
    const mod = ${factory}();
    expect(mod.compiled).toBeTruthy();
    expect(mod.ir?.irVersion).toBe(1);
  });

  test("edge: unique module id", () => {
    expect(${factory}().manifest.id).toBe("${id}");
  });
});
`;
}

function readme(id: string, recipe: Recipe): string {
  return `# \`@rpengineext/module-${id}\`

Scaffolded with \`@rpengineext/create-module\` (recipe: \`${recipe}\`).

Built on **\`@rpengineext/module-sdk\`**.  
Docs: \`docs/modules/README.md\` · \`docs/modules/sdk-reference.md\` · \`docs/modules/recipes.md\`.

## Dev

\`\`\`bash
bun test packages/modules/${id}
\`\`\`
`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const id = args[0]!;
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error(
      `invalid module id "${id}" — use kebab-case (e.g. mood, world-lore)`,
    );
    process.exit(1);
  }

  let recipe: Recipe = "state";
  const recipeIdx = args.indexOf("--recipe");
  if (recipeIdx >= 0) {
    const value = args[recipeIdx + 1] as Recipe | undefined;
    if (!value || !RECIPES.includes(value)) {
      console.error(`--recipe must be one of: ${RECIPES.join(", ")}`);
      process.exit(1);
    }
    recipe = value;
  }

  const root = path.resolve(import.meta.dir, "../../..");
  const target = path.join(root, "packages/modules", id);
  if (await exists(target)) {
    console.error(`already exists: ${target}`);
    process.exit(1);
  }

  await mkdir(path.join(target, "src"), { recursive: true });
  await mkdir(path.join(target, "tests"), { recursive: true });

  await writeFile(path.join(target, "package.json"), packageJson(id));
  await writeFile(path.join(target, "tsconfig.json"), tsconfig());
  await writeFile(path.join(target, "README.md"), readme(id, recipe));
  await writeFile(path.join(target, "src/index.ts"), indexSource(id, recipe));
  await writeFile(
    path.join(target, `tests/${id}.test.ts`),
    testSource(id),
  );

  console.log(`created ${path.relative(root, target)}`);
  console.log(`recipe: ${recipe}`);
  console.log(`next:
  bun install
  bun test packages/modules/${id}
  # edit src/index.ts — docs/modules/README.md + sdk-reference.md
  # wire createXxxModule() in host-bootstrap when ready
`);
}

await main();
