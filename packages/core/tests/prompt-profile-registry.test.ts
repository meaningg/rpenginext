import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPromptProfileRegistry,
  resolveNarrativePromptProfile,
} from "../src/agents/prompts/profile-registry.ts";
import { BUILTIN_DEFAULT_PROFILE_REF } from "../src/agents/prompts/builtin-default-profile.ts";

const MINIMAL = {
  id: "narrative",
  version: "2.0.0",
  labels: { playerAction: "Действие игрока:" },
  systemCore: "Ядро на {{locale}} — {{lengthGuidance}} «{{playerActionLabel}}»",
  rulesReminder: "Памятка.",
  repair: {
    title: "Ошибка.",
    instructions: ["Исправь. Проблемы: {{issues}}"],
    hintsTitle: "Подсказки:",
  },
};

function withTmpDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "rp-prompts-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeProfile(dir: string, name: string, body: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(body), "utf8");
}

describe("prompt-profile-registry", () => {
  test("loads built-in default when dir is empty", () => {
    withTmpDir((dir) => {
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.get(BUILTIN_DEFAULT_PROFILE_REF)).toBeDefined();
      expect(result.value.get("narrative@2.0.0")).toBeUndefined();
      expect(result.value.list().map((p) => `${p.id}@${p.version}`)).toEqual([
        BUILTIN_DEFAULT_PROFILE_REF,
      ]);
    });
  });

  test("loads a valid profile file next to built-in", () => {
    withTmpDir((dir) => {
      writeProfile(dir, "narrative@2.0.0.json", MINIMAL);
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const profile = result.value.get("narrative@2.0.0");
      expect(profile?.labels.playerAction).toBe("Действие игрока:");
      expect(result.value.get(BUILTIN_DEFAULT_PROFILE_REF)).toBeDefined();
    });
  });

  test("rejects file whose name does not match id@version", () => {
    withTmpDir((dir) => {
      writeProfile(dir, "narrative@3.0.0.json", MINIMAL);
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CONFIG_INVALID");
      expect(result.error.message).toContain("narrative@2.0.0.json");
    });
  });

  test("rejects invalid JSON", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "narrative@2.0.0.json"), "{not json", "utf8");
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CONFIG_INVALID");
      expect(result.error.message).toContain("not valid JSON");
    });
  });

  test("rejects unknown placeholder", () => {
    withTmpDir((dir) => {
      writeProfile(dir, "narrative@2.0.0.json", {
        ...MINIMAL,
        systemCore: "Ядро {{nope}}",
      });
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("nope");
    });
  });

  test("rejects placeholder outside field allowlist", () => {
    withTmpDir((dir) => {
      writeProfile(dir, "narrative@2.0.0.json", {
        ...MINIMAL,
        systemCore: "Ядро {{issues}}",
      });
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("not allowed");
    });
  });

  test("rejects duplicate id@version against built-in", () => {
    withTmpDir((dir) => {
      writeProfile(dir, "default@1.0.0.json", {
        id: "default",
        version: "1.0.0",
        labels: { playerAction: "X" },
        systemCore: "Ядро",
        rulesReminder: "Памятка.",
        repair: { title: "О.", instructions: ["О."], hintsTitle: "H" },
      });
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("duplicate");
    });
  });

  test("missing explicit dir fails boot; missing default dir warns", () => {
    const explicit = createPromptProfileRegistry({
      dir: join(tmpdir(), "rp-prompts-missing-explicit"),
      explicitDir: true,
    });
    expect(explicit.ok).toBe(false);
    if (explicit.ok) return;
    expect(explicit.error.code).toBe("CONFIG_INVALID");

    const implicit = createPromptProfileRegistry({
      dir: join(tmpdir(), "rp-prompts-missing-implicit"),
      explicitDir: false,
    });
    expect(implicit.ok).toBe(true);
  });

  test("rejects malformed schema (bad semver)", () => {
    withTmpDir((dir) => {
      writeProfile(dir, "narrative@two.json", { ...MINIMAL, version: "two" });
      const result = createPromptProfileRegistry({ dir, explicitDir: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CONFIG_INVALID");
    });
  });
});

describe("resolveNarrativePromptProfile", () => {
  const registry = createPromptProfileRegistry({ explicitDir: false });
  expect(registry.ok).toBe(true);
  if (!registry.ok) return;
  const reg = registry.value;

  test("falls back to built-in default without any config", () => {
    const result = resolveNarrativePromptProfile({ registry: reg, model: "gpt-4o" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ref).toBe(BUILTIN_DEFAULT_PROFILE_REF);
  });

  test("resolves per-model mapping", () => {
    const result = resolveNarrativePromptProfile({
      registry: reg,
      model: "gpt-4o",
      profilesByModel: { "gpt-4o": "default@1.0.0" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ref).toBe("default@1.0.0");
  });

  test("override wins over mapping and fallback", () => {
    const result = resolveNarrativePromptProfile({
      registry: reg,
      model: "gpt-4o",
      profilesByModel: { "gpt-4o": "default@1.0.0" },
      defaultProfile: "default@1.0.0",
      override: "default@1.0.0",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ref).toBe("default@1.0.0");
  });

  test("unknown ref fails with CONFIG_INVALID", () => {
    const result = resolveNarrativePromptProfile({
      registry: reg,
      model: "gpt-4o",
      defaultProfile: "narrative@9.9.9",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toContain("narrative@9.9.9");
  });
});
