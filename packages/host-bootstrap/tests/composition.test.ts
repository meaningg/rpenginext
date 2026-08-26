import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineModule } from "@rpengineext/module-sdk";
import type { Module } from "@rpengineext/contracts";

import {
  createHostRuntime,
  resolveHostModules,
} from "../src/create-host-runtime.ts";
import { readHostEnv } from "../src/env.ts";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rp-host-comp-"));
const dataDir = path.join(tmpRoot, "data");
const storiesDir = path.resolve(import.meta.dir, "../../../data/stories");

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const BASE_ENV = {
  RP_DATA_DIR: dataDir,
  RP_STORIES_DIR: storiesDir,
  RP_LOG_LEVEL: "error",
  RP_AGENTS_MODE: "mock",
} as const;

async function boot(options: Parameters<typeof createHostRuntime>[0] = {}) {
  return createHostRuntime({
    forceMock: true,
    loggerName: "host-composition-test",
    env: { ...BASE_ENV },
    ...options,
  });
}

function fixtureModule(id: string): Module {
  return defineModule({ id, version: "1.0.0", title: id });
}

describe("host module composition (specs/04)", () => {
  test("default boot = core-book profile (working-memory, world-canon, character)", async () => {
    const created = await boot();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ids = created.value.listModules().map((m) => m.id);
    expect(ids).toEqual(["working-memory", "world-canon", "character"]);
    await created.value.stop();
  });

  test("listModules exposes id/version/priority/provides/requires/slices", async () => {
    const created = await boot();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const wm = created.value.listModules().find((m) => m.id === "working-memory")!;
    expect(wm.version).toBe("1.0.0");
    expect(wm.priority).toBe(10);
    expect(wm.slices).toContain("working_memory");
    await created.value.stop();
  });

  test("RP_MODULE_PROFILE=minimal → working-memory only", async () => {
    const created = await boot({ env: { ...BASE_ENV, RP_MODULE_PROFILE: "minimal" } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules().map((m) => m.id)).toEqual(["working-memory"]);
    await created.value.stop();
  });

  test("RP_MODULES replaces profile set in list order", async () => {
    const created = await boot({
      env: { ...BASE_ENV, RP_MODULES: "character,working-memory" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules().map((m) => m.id)).toEqual([
      "working-memory",
      "character",
    ]);
    await created.value.stop();
  });

  test("RP_DISABLE_MODULES removes after resolution", async () => {
    const created = await boot({
      env: { ...BASE_ENV, RP_DISABLE_MODULES: "character" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ids = created.value.listModules().map((m) => m.id);
    expect(ids).not.toContain("character");
    expect(ids).toContain("working-memory");
    await created.value.stop();
  });

  test("extraModules appends after resolution (4th module)", async () => {
    const created = await boot({ extraModules: [fixtureModule("fourth")] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ids = created.value.listModules().map((m) => m.id);
    expect(ids).toEqual(["working-memory", "world-canon", "character", "fourth"]);
    await created.value.stop();
  });

  test("options.modules full override ignores profile/env entirely", async () => {
    const created = await boot({
      modules: [fixtureModule("only-a"), fixtureModule("only-b")],
      moduleProfile: "none",
      env: { ...BASE_ENV, RP_MODULE_PROFILE: "minimal", RP_MODULES: "character" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules().map((m) => m.id)).toEqual(["only-a", "only-b"]);
    await created.value.stop();
  });

  test("unknown catalog id in RP_MODULES → boot fail MODULE_UNKNOWN", async () => {
    const created = await boot({
      env: { ...BASE_ENV, RP_MODULES: "working-memory,no-such-module" },
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("MODULE_UNKNOWN");
    expect(created.error.message).toContain("no-such-module");
  });

  test("enabledModuleIds adds; disabledModuleIds removes; enabled∩disabled → CONFIG_INVALID", async () => {
    const created = await boot({
      moduleProfile: "minimal",
      enabledModuleIds: ["character"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules().map((m) => m.id)).toEqual([
      "working-memory",
      "character",
    ]);
    await created.value.stop();

    const conflict = await boot({
      moduleProfile: "none",
      enabledModuleIds: ["character", "world-canon"],
      disabledModuleIds: ["character", "working-memory"],
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe("CONFIG_INVALID");
    expect(conflict.error.message).toContain("character");
    // Both full lists in details (specs/04 §4.1.1 locked decision).
    expect(conflict.error.details).toMatchObject({
      enabledModuleIds: ["character", "world-canon"],
      disabledModuleIds: ["character", "working-memory"],
    });
  });

  test("duplicate id after merge (RP_MODULES / enabledModuleIds) → boot fail MODULE_ID_DUPLICATE", async () => {
    const viaEnv = await boot({
      env: { ...BASE_ENV, RP_MODULES: "working-memory,character,working-memory" },
    });
    expect(viaEnv.ok).toBe(false);
    if (viaEnv.ok) return;
    expect(viaEnv.error.code).toBe("MODULE_ID_DUPLICATE");
    expect(viaEnv.error.message).toContain("working-memory");

    const viaOptions = await boot({
      moduleProfile: "none",
      enabledModuleIds: ["working-memory", "character", "character"],
    });
    expect(viaOptions.ok).toBe(false);
    if (viaOptions.ok) return;
    expect(viaOptions.error.code).toBe("MODULE_ID_DUPLICATE");
    expect(viaOptions.error.message).toContain("character");
  });

  test("empty module set boots (profile none; core loop still runs)", async () => {
    const created = await boot({ moduleProfile: "none" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.listModules()).toEqual([]);
    await created.value.stop();
  });

  test("equal priority tie-break = registration order (deterministic)", async () => {
    const created = await boot({
      modules: [
        fixtureModule("zeta"),
        fixtureModule("alpha"),
        fixtureModule("mid"),
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // All fixtures have priority 100 → registration order preserved.
    expect(created.value.listModules().map((m) => m.id)).toEqual([
      "zeta",
      "alpha",
      "mid",
    ]);
    await created.value.stop();
  });

  test("strict capabilities default ON: missing requires fails boot", async () => {
    const created = await boot({
      modules: [
        defineModule({
          id: "needs-thing",
          version: "1.0.0",
          title: "Needs",
          requires: ["capability:thing"],
        }),
      ],
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("MODULE_REQUIRES_MISSING");
  });
});

describe("resolveHostModules (precedence unit)", () => {
  const env = readHostEnv({ ...BASE_ENV, RP_AGENTS_MODE: undefined as never });

  test("default profile → core-book ids", () => {
    const res = resolveHostModules({}, env);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.ids).toEqual(["working-memory", "world-canon", "character"]);
  });

  test("profile option beats env", () => {
    const withEnv = readHostEnv({
      ...BASE_ENV,
      RP_MODULE_PROFILE: "minimal",
      RP_AGENTS_MODE: undefined as never,
    });
    const res = resolveHostModules({ moduleProfile: "none" }, withEnv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.ids).toEqual([]);
  });

  test("RP_MODULES beats profile", () => {
    const withEnv = readHostEnv({
      ...BASE_ENV,
      RP_MODULE_PROFILE: "minimal",
      RP_MODULES: "character",
      RP_AGENTS_MODE: undefined as never,
    });
    const res = resolveHostModules({}, withEnv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.ids).toEqual(["character"]);
  });
});