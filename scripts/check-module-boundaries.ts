#!/usr/bin/env bun
/**
 * Module boundary CI (specs/06 §5.2).
 *
 * Fails if any module package under `packages/modules` declares a RUNTIME
 * dependency on another `@rpengineext/module-*` package — module→module
 * package deps are forbidden (inter-module communication goes through
 * access.read / readModel / events / provides+requires only).
 *
 * Allowed runtime deps: `@rpengineext/module-sdk`, `zod`; `@rpengineext/contracts`
 * only when justified (prefer types via sdk). `@rpengineext/core` must be a
 * devDependency (tests only).
 *
 * Usage: `bun run test:module-boundaries`
 */
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const PACKAGES_ROOT = path.resolve(import.meta.dir, "../packages/modules");
const ALLOWED_RUNTIME = new Set(["@rpengineext/module-sdk", "zod"]);

const files = readdirSync(PACKAGES_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(entry.name, "package.json"))
  .filter((file) => existsSync(path.join(PACKAGES_ROOT, file)));
const problems: string[] = [];

for (const file of files.sort()) {
  const pkg = JSON.parse(
    await readFile(path.join(PACKAGES_ROOT, file), "utf8"),
  ) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = pkg.dependencies ?? {};

  for (const [name] of Object.entries(deps)) {
    if (name.startsWith("@rpengineext/module-") && name !== "@rpengineext/module-sdk") {
      problems.push(
        `${pkg.name ?? file}: runtime dependency on another module package "${name}" is FORBIDDEN (specs/06 §4.2). Use access.read / readModel / events / provides+requires.`,
      );
    }
    if (name.startsWith("@rpengineext/core")) {
      problems.push(
        `${pkg.name ?? file}: runtime dependency on "${name}" is FORBIDDEN — core is a devDependency for tests only (specs/00 §8.1).`,
      );
    }
    if (!ALLOWED_RUNTIME.has(name) && !name.startsWith("@rpengineext/contracts")) {
      problems.push(
        `${pkg.name ?? file}: unexpected runtime dependency "${name}" (allowed: ${[...ALLOWED_RUNTIME].join(", ")}, contracts-if-justified).`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("module-boundaries: FAIL\n");
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(
    "\nInter-module communication channels: access.read slices, ctx.readModel, events emit/subscribe, provides/requires tokens (docs/modules/conventions.md).",
  );
  process.exit(1);
}

console.log("module-boundaries: OK (no module→module runtime deps)");