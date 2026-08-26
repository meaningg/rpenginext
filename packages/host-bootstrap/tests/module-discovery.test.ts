import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { TurnLogger } from "@rpengineext/contracts";

import { createHostRuntime } from "../src/create-host-runtime.ts";
import { discoverModulePool } from "../src/module-discovery.ts";

/**
 * Local module discovery (ADR 0006) — pool semantics:
 * modules declare `rpengineext.module` in package.json, host scans roots,
 * selection stays explicit (RP_MODULES / profiles / options).
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rp-disc-"));
const modulesRoot = path.join(tmpRoot, "modules");
const dataDir = path.join(tmpRoot, "data");
const storiesDir = path.resolve(import.meta.dir, "../../../data/stories");

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const quietLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return quietLog;
  },
} as unknown as TurnLogger;

function pascal(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Writes a discoverable module package (raw Module; no sdk import needed). */
function writeModulePackage(
  pkgId: string,
  opts: {
    entry?: string;
    factory?: string;
    declareEntry?: string | null; // null = omit rpengineext.module entirely
    name?: string;
    declareId?: boolean;
  } = {},
): string {
  const dir = path.join(modulesRoot, pkgId);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  const entry = opts.entry ?? "./src/index.ts";
  const factory = opts.factory ?? `create${pascal(pkgId)}Module`;
  const pkg: Record<string, unknown> = {
    name: opts.name ?? `@rpengineext/module-${pkgId}`,
    version: "1.0.0",
    private: true,
    type: "module",
  };
  if (opts.declareEntry !== null) {
    pkg.rpengineext = {
      module: {
        ...(opts.declareId ? { id: pkgId } : {}),
        entry: opts.declareEntry ?? entry,
        factory,
      },
    };
  }
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  const src = `
export function ${factory}() {
  return {
    manifest: {
      id: "${pkgId}",
      version: "1.0.0",
      displayName: "${pkgId}",
      description: "",
      engines: { core: "^1.0.0", contracts: "^1.0.0" },
      priority: 100,
      provides: [],
      requires: [],
      permissions: [],
      stateSlices: [],
      registers: [],
      contributes: [],
      interceptors: [],
    },
    register() {},
  };
}
`;
  fs.writeFileSync(path.join(dir, "src/index.ts"), src);
  return dir;
}

async function boot(extra: Record<string, string | undefined> = {}, options: Parameters<typeof createHostRuntime>[0] = {}) {
  return createHostRuntime({
    forceMock: true,
    loggerName: "module-discovery-test",
    env: {
      RP_DATA_DIR: dataDir,
      RP_STORIES_DIR: storiesDir,
      RP_LOG_LEVEL: "error",
      ...extra,
    },
    ...options,
  });
}

describe("module discovery (ADR 0006)", () => {
  test("pool builds id-sorted entries; packages without the field are skipped", async () => {
    writeModulePackage("mood");
    writeModulePackage("alpha");
    writeModulePackage("plain", { declareEntry: null }); // no rpengineext field

    const result = await discoverModulePool([modulesRoot], { log: quietLog });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // id-lexicographic (alpha < mood), plain-package skipped.
    expect(result.value.map((e) => e.id)).toEqual(["alpha", "mood"]);
    expect(result.value.every((e) => e.source.includes("package.json"))).toBe(true);
  });

  test("full boot: RP_MODULES selects a discovered module; lazy import (unselected broken entry is never touched)", async () => {
    writeModulePackage("mood");
    // Unselected module with a MISSING entry — must never be imported.
    writeModulePackage("zombie", { entry: "./src/missing.ts" });

    const created = await boot({ RP_MODULE_DIRS: modulesRoot, RP_MODULES: "mood" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules().map((m) => m.id)).toContain("mood");
    expect(created.value.listModules().map((m) => m.id)).not.toContain("zombie");
    await created.value.stop();
  });

  test("selecting a broken discovered entry → boot fail CONFIG_INVALID", async () => {
    writeModulePackage("broken-mod", { entry: "./src/missing.ts" });
    const created = await boot({ RP_MODULE_DIRS: modulesRoot, RP_MODULES: "broken-mod" });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("CONFIG_INVALID");
    expect(created.error.message).toContain("broken-mod");
  });

  test("RP_DISABLE_MODULES removes a discovered module after resolution", async () => {
    writeModulePackage("mood");
    const created = await boot({
      RP_MODULE_DIRS: modulesRoot,
      RP_MODULES: "mood",
      RP_DISABLE_MODULES: "mood",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules().map((m) => m.id)).not.toContain("mood");
    await created.value.stop();
  });

  test("unknown id hint includes discovered pool ids", async () => {
    writeModulePackage("mood");
    const created = await boot({ RP_MODULE_DIRS: modulesRoot, RP_MODULES: "nope" });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("MODULE_UNKNOWN");
    expect(created.error.message).toContain("mood");
  });

  test("duplicate id inside discovery → boot fail MODULE_ID_DUPLICATE with both sources", async () => {
    const root2 = path.join(tmpRoot, "modules2");
    fs.mkdirSync(root2, { recursive: true });
    fs.rmSync(path.join(modulesRoot, "mood"), { recursive: true, force: true });
    writeModulePackage("mood");
    const dir2 = path.join(root2, "mood");
    fs.mkdirSync(path.join(dir2, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(dir2, "package.json"),
      JSON.stringify({
        name: "@other/module-mood",
        version: "1.0.0",
        rpengineext: { module: { entry: "./src/index.ts", factory: "createMoodModule" } },
      }),
    );
    fs.copyFileSync(path.join(modulesRoot, "mood", "src/index.ts"), path.join(dir2, "src/index.ts"));

    const created = await boot({ RP_MODULE_DIRS: `${modulesRoot},${root2}` });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("MODULE_ID_DUPLICATE");
    expect(created.error.message).toContain("mood");
  });

  test("catalog wins on id collision with discovery (boot ok)", async () => {
    writeModulePackage("character"); // collides with MODULE_CATALOG
    const created = await boot({ RP_MODULE_DIRS: modulesRoot });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Catalog instance (priority 20) wins; discovery entry ignored.
    const character = created.value.listModules().find((m) => m.id === "character")!;
    expect(character).toBeDefined();
    expect(character.priority).toBe(20);
    await created.value.stop();
  });

  test("invalid declaration (entry not a string) → boot fail CONFIG_INVALID", async () => {
    const dir = path.join(modulesRoot, "bad-decl");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "@rpengineext/module-bad-decl",
        version: "1.0.0",
        rpengineext: { module: { entry: 42, factory: "createBadDeclModule" } },
      }),
    );
    const created = await boot({ RP_MODULE_DIRS: modulesRoot });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("CONFIG_INVALID");
  });

  test("missing factory export → boot fail CONFIG_INVALID at selection", async () => {
    // Keep the scan root clean: drop the previously written invalid-declaration
    // package so the expected failure comes from THIS package's declaration.
    fs.rmSync(path.join(modulesRoot, "bad-decl"), { recursive: true, force: true });
    const dir = path.join(modulesRoot, "no-factory");
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "@rpengineext/module-no-factory",
        version: "1.0.0",
        rpengineext: { module: { entry: "./src/index.ts", factory: "createNopeModule" } },
      }),
    );
    fs.writeFileSync(path.join(dir, "src/index.ts"), "export const notAFactory = 1;\n");
    const created = await boot({
      RP_MODULE_DIRS: modulesRoot,
      RP_MODULES: "no-factory",
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("CONFIG_INVALID");
    expect(created.error.message).toContain("no-factory");
  });

  test("explicitly configured missing root → boot fail CONFIG_INVALID; options.modules skips discovery", async () => {
    const missing = path.join(tmpRoot, "no-such-dir");
    const created = await boot({ RP_MODULE_DIRS: missing });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("CONFIG_INVALID");
    expect(created.error.message).toContain(missing);

    // options.modules is exclusive: discovery (incl. broken dir) skipped.
    const { defineModule } = await import("@rpengineext/module-sdk");
    const override = await boot(
      { RP_MODULE_DIRS: missing },
      { modules: [defineModule({ id: "override-only", version: "1.0.0", title: "O" })] },
    );
    expect(override.ok).toBe(true);
    if (!override.ok) return;
    expect(override.value.listModules().map((m) => m.id)).toEqual(["override-only"]);
    await override.value.stop();
  });

  test("deterministic order across two boots", async () => {
    writeModulePackage("mood");
    writeModulePackage("zeta");
    const a = await boot({ RP_MODULE_DIRS: modulesRoot, RP_MODULES: "mood,zeta" });
    const b = await boot({ RP_MODULE_DIRS: modulesRoot, RP_MODULES: "mood,zeta" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.listModules().map((m) => m.id)).toEqual(b.value.listModules().map((m) => m.id));
    await a.value.stop();
    await b.value.stop();
  });
});