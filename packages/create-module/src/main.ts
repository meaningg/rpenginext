#!/usr/bin/env bun
/**
 * Scaffold a product module on @rpengineext/module-sdk (CBMD) — Module
 * Platform 1.0 (specs/05).
 *
 * Usage:
 *   bun run create-module <module-id> [--recipe <name>] [--out <dir>]
 *
 * Recipes (all required for 1.0):
 *   state | seed-narrative | guard | full | ai-tool | access-read | migrate | events
 *
 * `--out` overrides the target directory (CI scaffold smoke uses a temp dir).
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildTemplates,
  RECIPES,
  toSliceName,
} from "./templates.ts";

function printHelp(): void {
  console.log(`create-module <module-id> [--recipe ${RECIPES.join("|")}] [--out <dir>]

Scaffolds a module package on @rpengineext/module-sdk (Platform 1.0).

Recipes (all produce code + harness tests + public contract README):
  state          slice + ops + turn.change (meters/flags)
  seed-narrative seed + narrative.system (lore/canon)
  guard          rules.guard + deny (legality)
  full           coherent union of common blocks (starter)
  ai-tool        committed → scheduleSystem → ai.task + tool → proposeOp
  access-read    access.read + narrative/read from foreign (composition)
  migrate        v1→v2 migrations + load test (save compatibility)
  events         publish (events.emit) + subscribe + follow-up scheduleSystem

Examples:
  bun run create-module mood
  bun run create-module lore --recipe seed-narrative
  bun run create-module moods --recipe state --out /tmp/scaffold-check

Docs: docs/modules/README.md · docs/modules/sdk-reference.md · docs/modules/recipes.md
`);
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

  let recipe: (typeof RECIPES)[number] = "state";
  const recipeIdx = args.indexOf("--recipe");
  if (recipeIdx >= 0) {
    const value = args[recipeIdx + 1] as string | undefined;
    if (!value || !(RECIPES as readonly string[]).includes(value)) {
      console.error(`--recipe must be one of: ${RECIPES.join(", ")}`);
      process.exit(1);
    }
    recipe = value as (typeof RECIPES)[number];
  }

  let target: string;
  const outIdx = args.indexOf("--out");
  if (outIdx >= 0) {
    const out = args[outIdx + 1];
    if (!out) {
      console.error("--out requires a directory path");
      process.exit(1);
    }
    target = path.resolve(out, id);
  } else {
    const root = path.resolve(import.meta.dir, "../../..");
    target = path.join(root, "packages/modules", id);
  }

  if (await exists(target)) {
    console.error(`already exists: ${target}`);
    process.exit(1);
  }

  const templates = buildTemplates(id, recipe);
  const slice = toSliceName(id);

  await mkdir(path.join(target, "src"), { recursive: true });
  await mkdir(path.join(target, "tests"), { recursive: true });

  await writeFile(
    path.join(target, "package.json"),
    `${JSON.stringify(
      {
        name: `@rpengineext/module-${id}`,
        version: "1.0.0",
        private: true,
        type: "module",
        description: `rpengineext module ${id} (module-sdk Platform 1.0)`,
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
          "@rpengineext/contracts": "workspace:*",
          "@rpengineext/core": "workspace:*",
          "@types/bun": "latest",
          typescript: "^5",
        },
        engines: { bun: ">=1.1.0" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(target, "tsconfig.json"),
    `{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "composite": false,
    "rootDir": ".",
    "types": ["bun"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
`,
  );
  await writeFile(path.join(target, "README.md"), templates.readme);
  await writeFile(path.join(target, "src/index.ts"), templates.index);
  await writeFile(
    path.join(target, `tests/${id}.test.ts`),
    templates.test,
  );

  console.log(`created ${path.relative(process.cwd(), target)}`);
  console.log(`recipe: ${recipe}`);
  console.log(`public contract: README.md -> "Public contract" section`);
  console.log(`tests: harness (@rpengineext/module-sdk/test), ≥3 cases`);
  console.log(`next:
  bun install
  bun test packages/modules/${id}
  # edit src/index.ts — docs/modules/README.md + sdk-reference.md
  # wire createXxxModule() in host-bootstrap (profile or RP_MODULES) when ready
`);
}

await main();