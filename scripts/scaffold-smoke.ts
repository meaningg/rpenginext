#!/usr/bin/env bun
/**
 * Scaffold smoke CI for `create-module` (specs/05 §6 — gate `test:scaffold-smoke`).
 *
 * For every recipe (state | seed-narrative | guard | full | ai-tool | access-read |
 * migrate | events):
 *   1. scaffold a real module package into `packages/modules/scaffold-<recipe>`
 *      via the public `create-module` entry (`packages/create-module/src/main.ts`);
 *   2. run its harness tests (`bun test <pkg>`);
 *   3. typecheck it (`tsc --noEmit`);
 *   4. clean up (Windows-safe rm, sqlite files may be held open).
 *
 * The scaffold target lives inside the workspace on purpose: `workspace:*` deps
 * resolve through the root node_modules exactly like a real author workflow.
 *
 * Failures are preserved under `<root>/.tmp/scaffold-fail/<id>` for inspection;
 * successful scaffolds are removed. Exit code is non-zero if any recipe fails.
 *
 * Usage: `bun run test:scaffold-smoke`
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, renameSync } from "node:fs";
import path from "node:path";

import { RECIPES } from "../packages/create-module/src/templates.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const SCAFFOLD_ROOT = path.join(ROOT, "packages/modules");
const FAIL_ROOT = path.join(ROOT, "tmp-scaffold-fail");
const createModuleEntry = path.join(ROOT, "packages/create-module/src/main.ts");
const bunBin = process.execPath;

interface RunResult {
  ok: boolean;
  output: string;
}

function run(cmd: string, args: readonly string[], cwd: string, timeoutMs: number): RunResult {
  try {
    const output = execFileSync(cmd, [...args], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      timeout: timeoutMs,
      windowsHide: true,
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    const parts = [e.stdout, e.stderr, e.message]
      .filter((p): p is string | Buffer => p != null)
      .map((p) => (typeof p === "string" ? p : p.toString("utf8")));
    return { ok: false, output: parts.join("\n") };
  }
}

function rmSafe(target: string): void {
  rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

const results: Array<{ recipe: string; stage: string; ok: boolean; tail: string }> = [];
let failed = false;

mkdirSync(FAIL_ROOT, { recursive: true });
rmSafe(FAIL_ROOT);
mkdirSync(FAIL_ROOT, { recursive: true });

for (const recipe of RECIPES) {
  const id = `scaffold-${recipe}`;
  const target = path.join(SCAFFOLD_ROOT, id);
  const failedTarget = path.join(FAIL_ROOT, id);
  rmSafe(target); // stale leftovers from a previous interrupted run
  rmSafe(failedTarget);

  // --- 1. scaffold via the public entry -----------------------------------
  const scaffold = run(bunBin, [createModuleEntry, id, "--recipe", recipe], ROOT, 60_000);
  if (!scaffold.ok) {
    results.push({ recipe, stage: "scaffold", ok: false, tail: scaffold.output });
    failed = true;
    continue;
  }

  // --- 2. harness tests -----------------------------------------------------
  const tests = run(bunBin, ["test", target], ROOT, 120_000);
  if (!tests.ok) {
    renameSync(target, failedTarget);
    results.push({ recipe, stage: "test", ok: false, tail: tests.output });
    failed = true;
    continue;
  }

  // --- 3. typecheck ----------------------------------------------------------
  const typecheck = run(
    bunBin,
    ["x", "tsc", "--noEmit", "-p", path.join(target, "tsconfig.json")],
    ROOT,
    120_000,
  );
  if (!typecheck.ok) {
    renameSync(target, failedTarget);
    results.push({ recipe, stage: "typecheck", ok: false, tail: typecheck.output });
    failed = true;
    continue;
  }

  // --- 4. cleanup -------------------------------------------------------------
  rmSafe(target);
  results.push({ recipe, stage: "all", ok: true, tail: "" });
}

console.log("\n=== create-module scaffold smoke ===");
for (const r of results) {
  if (r.ok) {
    console.log(`  PASS  ${r.recipe} (scaffold + tests + typecheck)`);
  } else {
    console.log(`  FAIL  ${r.recipe} @ ${r.stage}`);
    console.log(`        preserved at tmp-scaffold-fail/${r.recipe}`);
    const lines = r.tail.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines.slice(-12)) console.log(`          ${line}`);
  }
}

if (failed) {
  console.error(`\nscaffold smoke FAILED (${results.filter((r) => !r.ok).length} of ${results.length} recipes)`);
  process.exit(1);
}
console.log(`\nscaffold smoke OK (${results.length}/${results.length} recipes)`);