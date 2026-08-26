import { describe, expect, test } from "bun:test";

import {
  NARRATIVE_PROMPT_FIELD_PLACEHOLDERS,
  resolvePromptTemplate,
  validatePromptTemplate,
  type PromptPlaceholderContext,
} from "../src/agents/prompts/placeholder-resolver.ts";

const CTX: PromptPlaceholderContext = {
  locale: "ru",
  lengthGuidance: "Мягкий ориентир длины prose — около 120–150 слов.",
  playerActionLabel: "Действие игрока:",
  issues: "prose must be non-empty",
  hints: "- hint one\n- hint two",
};

describe("placeholder-resolver", () => {
  test("resolves all known placeholders in one template", () => {
    const template =
      "Locale {{locale}}; guidance: {{lengthGuidance}}; label «{{playerActionLabel}}»";
    const result = resolvePromptTemplate(template, CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(
      "Locale ru; guidance: Мягкий ориентир длины prose — около 120–150 слов.; label «Действие игрока:»",
    );
  });

  test("resolves repair-only placeholders", () => {
    const template = "Problems: {{issues}}; hints: {{hints}}";
    const result = resolvePromptTemplate(template, CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(
      "Problems: prose must be non-empty; hints: - hint one\n- hint two",
    );
  });

  test("rejects unknown placeholder", () => {
    const result = resolvePromptTemplate("Hello {{unknown}}", CTX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toContain("unknown");
  });

  test("rejects known placeholder without provided value", () => {
    const result = resolvePromptTemplate("Locale {{locale}}", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toContain("no value provided");
  });

  test("validatePromptTemplate passes for known placeholders within allowlist", () => {
    const result = validatePromptTemplate(
      "{{locale}} {{lengthGuidance}} {{playerActionLabel}}",
      NARRATIVE_PROMPT_FIELD_PLACEHOLDERS.systemCore,
    );
    expect(result.ok).toBe(true);
  });

  test("validatePromptTemplate rejects placeholder outside field allowlist", () => {
    const result = validatePromptTemplate(
      "{{issues}}",
      NARRATIVE_PROMPT_FIELD_PLACEHOLDERS.systemCore,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toContain("not allowed");
  });

  test("leaves text without placeholders untouched", () => {
    const result = resolvePromptTemplate("Ты — автор книги.", CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe("Ты — автор книги.");
  });

  test("built-in default profile template passes full validation", async () => {
    const { getBuiltinDefaultProfile } = await import(
      "../src/agents/prompts/builtin-default-profile.ts"
    );
    const profile = getBuiltinDefaultProfile();
    expect(
      validatePromptTemplate(
        profile.systemCore,
        NARRATIVE_PROMPT_FIELD_PLACEHOLDERS.systemCore,
      ).ok,
    ).toBe(true);
    expect(
      validatePromptTemplate(
        profile.rulesReminder,
        NARRATIVE_PROMPT_FIELD_PLACEHOLDERS.rulesReminder,
      ).ok,
    ).toBe(true);
    for (const instruction of profile.repair.instructions) {
      expect(
        validatePromptTemplate(
          instruction,
          NARRATIVE_PROMPT_FIELD_PLACEHOLDERS["repair.instructions"],
        ).ok,
      ).toBe(true);
    }
  });
});
