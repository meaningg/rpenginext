import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI_MAIN = resolve(import.meta.dir, "../src/main.ts");
const dataDir = mkdtempSync(join(tmpdir(), "rp-cli-test-"));

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/**
 * Module-composition env keys (specs/04 §4.1.1 precedence, ADR 0006).
 * Bun loads the repo `.env` into spawned `bun run` children, so ambient
 * values from the developer machine (e.g. RP_MODULES from discovery
 * experiments) would override the test's explicit profile. Override them
 * with empty strings so Bun does not re-inject .env values and
 * `parseCommaList` treats them as unset (empty → undefined).
 */
const SCRUBBED_ENV_OVERRIDES: Record<string, string> = {
  RP_MODULES: "",
  RP_DISABLE_MODULES: "",
  RP_MODULE_PROFILE: "",
  RP_MODULE_DIRS: "",
};

function runCli(
  args: string[],
  extraEnv: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", CLI_MAIN, ...args],
    env: {
      ...process.env,
      RP_DATA_DIR: dataDir,
      NO_COLOR: "1",
      ...SCRUBBED_ENV_OVERRIDES,
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("CLI host (specs/04 §6.2 module inventory)", () => {
  test("--modules lists the core-book inventory", () => {
    const { exitCode, stdout, stderr } = runCli(["--modules"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("rpengineext modules");
    expect(stdout).toContain("working-memory");
    expect(stdout).toContain("world-canon");
    expect(stdout).toContain("character");
    expect(stdout).toMatch(/priority=\d+/);
    expect(stdout).toMatch(/slices=\[/);
  });

  test("--modules honors RP_MODULE_PROFILE=minimal", () => {
    const { exitCode, stdout } = runCli(["--modules"], {
      RP_MODULE_PROFILE: "minimal",
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("working-memory");
    expect(stdout).not.toContain("character");
  });

  test(
    "boot + one mock turn works (--once hello)",
    { timeout: 30_000 },
    () => {
      const { exitCode, stdout, stderr } = runCli(["--once", "hello"]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("rpengineext CLI");
      expect(stdout).toContain("committed");
      expect(existsSync(dataDir)).toBe(true);
    },
  );
});