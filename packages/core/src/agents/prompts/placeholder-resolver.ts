import { err, failure, ok, type Failure, type Result } from "@rpengineext/contracts";

/**
 * Closed placeholder dictionary for narrative prompt profiles (ADR 0007 D2).
 * Any other `{{...}}` fails validation with `CONFIG_INVALID` at boot.
 */
export const NARRATIVE_PROMPT_PLACEHOLDERS = [
  "locale",
  "lengthGuidance",
  "playerActionLabel",
  "issues",
  "hints",
] as const;

export type NarrativePromptPlaceholder =
  (typeof NARRATIVE_PROMPT_PLACEHOLDERS)[number];

/**
 * Per-field allowed placeholder subsets (validator hint). Keeps authors from
 * putting repair-only placeholders into system text and vice versa.
 */
export const NARRATIVE_PROMPT_FIELD_PLACEHOLDERS: Readonly<
  Record<string, readonly NarrativePromptPlaceholder[]>
> = {
  systemCore: ["locale", "lengthGuidance", "playerActionLabel"],
  rulesReminder: ["locale", "lengthGuidance", "playerActionLabel"],
  "repair.instructions": ["issues", "hints"],
};

/**
 * Values resolved into `{{...}}` placeholders at prompt build time.
 * All fields are optional by type, but `resolvePromptTemplate` fails fast when
 * a placeholder present in the template has no provided value — no silent
 * empty substitution. `issues` / `hints` are repair-only.
 */
export interface PromptPlaceholderContext {
  readonly locale?: string;
  readonly lengthGuidance?: string;
  readonly playerActionLabel?: string;
  /** Repair-only: schema validation issues (may be empty string). */
  readonly issues?: string;
  /** Repair-only: extra repair hints joined by the caller (may be empty string). */
  readonly hints?: string;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

/**
 * Validates a template string: every `{{name}}` must be a known placeholder
 * and (when an allowlist is given) be allowed in this field.
 *
 * @param text - template text
 * @param allowed - optional per-field allowlist
 */
export function validatePromptTemplate(
  text: string,
  allowed?: readonly NarrativePromptPlaceholder[],
): Result<void, Failure> {
  for (const name of findPlaceholderNames(text)) {
    if (!isKnownPlaceholder(name)) {
      return err(
        failure("CONFIG_INVALID", `unknown narrative prompt placeholder "{{${name}}}"`, {
          details: { placeholder: name },
        }),
      );
    }
    if (allowed && !allowed.includes(name as NarrativePromptPlaceholder)) {
      return err(
        failure(
          "CONFIG_INVALID",
          `placeholder "{{${name}}}" is not allowed in this prompt field`,
          { details: { placeholder: name } },
        ),
      );
    }
  }
  return ok(undefined);
}

/**
 * Resolves all `{{...}}` placeholders in a template. Unknown placeholder or a
 * known one without a provided value → error (no silent empty substitution).
 *
 * @param text - template text
 * @param ctx - placeholder values
 */
export function resolvePromptTemplate(
  text: string,
  ctx: PromptPlaceholderContext,
): Result<string, Failure> {
  let out = "";
  let last = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
    const name = match[1] as string;
    if (!isKnownPlaceholder(name)) {
      return err(
        failure("CONFIG_INVALID", `unknown narrative prompt placeholder "{{${name}}}"`, {
          details: { placeholder: name },
        }),
      );
    }
    const value = ctx[name as NarrativePromptPlaceholder];
    if (value === undefined) {
      return err(
        failure(
          "CONFIG_INVALID",
          `no value provided for narrative prompt placeholder "{{${name}}}"`,
          { details: { placeholder: name } },
        ),
      );
    }
    out += text.slice(last, match.index) + value;
    last = match.index + match[0].length;
  }
  out += text.slice(last);
  return ok(out);
}

function findPlaceholderNames(text: string): string[] {
  const names: string[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
    names.push(match[1] as string);
  }
  return names;
}

function isKnownPlaceholder(name: string): boolean {
  return (NARRATIVE_PROMPT_PLACEHOLDERS as readonly string[]).includes(name);
}
