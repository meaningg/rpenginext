import {
  err,
  failure,
  ok,
  type Failure,
  type Result,
  type TurnLogger,
} from "@rpengineext/contracts";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUILTIN_DEFAULT_PROFILE_REF,
  getBuiltinDefaultProfile,
} from "./builtin-default-profile.ts";
import {
  NARRATIVE_PROMPT_FIELD_PLACEHOLDERS,
  validatePromptTemplate,
} from "./placeholder-resolver.ts";
import {
  NarrativePromptProfileSchema,
  profileRefOf,
  type NarrativePromptProfile,
} from "./profile-types.ts";

/** Default directory with `*.json` prompt profiles when nothing is configured. */
export const DEFAULT_PROMPT_PROFILES_DIR = "data/prompts";

/**
 * Loaded prompt profile registry: built-in `default@1.0.0` + files from dir.
 * Key is the `id@version` reference (ADR 0007).
 */
export interface PromptProfileRegistry {
  readonly profiles: ReadonlyMap<string, NarrativePromptProfile>;
  /**
   * Returns a profile by `id@version` reference.
   *
   * @param ref - e.g. `narrative@2.0.0`
   */
  get(ref: string): NarrativePromptProfile | undefined;
  /** All loaded profiles (built-in first, then files sorted by ref). */
  list(): NarrativePromptProfile[];
}

export interface CreatePromptProfileRegistryOptions {
  /** Directory scanned for `*.json` profiles; undefined = default dir. */
  readonly dir?: string;
  /**
   * When true the dir was explicitly configured (env/config) and must exist,
   * otherwise boot fails `CONFIG_INVALID`. Default dir may be absent (warn).
   */
  readonly explicitDir?: boolean;
  readonly log?: TurnLogger;
}

/**
 * Loads prompt profiles: built-in default + `*.json` files from the directory.
 * Validates schema, file-name `{id}@{version}.json` contract, placeholders and
 * `id@version` uniqueness (ADR 0007 D1/D2).
 *
 * @param options - directory + explicit flag + logger
 */
export function createPromptProfileRegistry(
  options: CreatePromptProfileRegistryOptions = {},
): Result<PromptProfileRegistry, Failure> {
  const log = options.log;
  const profiles = new Map<string, NarrativePromptProfile>();

  const builtin = getBuiltinDefaultProfile();
  profiles.set(BUILTIN_DEFAULT_PROFILE_REF, builtin);

  const dir = options.dir ?? DEFAULT_PROMPT_PROFILES_DIR;
  let entries: string[] | undefined;
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isDirMissing(error)) {
      if (options.explicitDir === true) {
        return err(
          failure(
            "CONFIG_INVALID",
            `prompt profiles dir "${dir}" does not exist (configured explicitly)`,
            { details: { dir } },
          ),
        );
      }
      log?.warn({ dir }, "prompt profiles dir missing — using built-in default");
      return ok({ profiles, get, list });
    }
    return err(
      failure("CONFIG_INVALID", `failed to scan prompt profiles dir "${dir}"`, {
        details: { dir, error: String(error) },
      }),
    );
  }

  for (const name of entries) {
    const loaded = loadProfileFile(dir, name);
    if (!loaded.ok) return loaded;
    const profile = loaded.value;
    const ref = profileRefOf(profile);
    if (profiles.has(ref)) {
      const extra = profiles.get(ref) === builtin ? "built-in" : `file ${ref}`;
      return err(
        failure(
          "CONFIG_INVALID",
          `duplicate narrative prompt profile "${ref}" (file ${name} collides with ${extra})`,
          { details: { ref, file: name } },
        ),
      );
    }
    profiles.set(ref, profile);
  }

  return ok({ profiles, get, list });

  function get(ref: string): NarrativePromptProfile | undefined {
    return profiles.get(ref);
  }

  function list(): NarrativePromptProfile[] {
    return [...profiles.values()].sort((a, b) =>
      profileRefOf(a).localeCompare(profileRefOf(b)),
    );
  }
}

/**
 * Resolves the effective profile for `narrative.write` (ADR 0007 D3):
 * override (env) → per-model mapping → defaultProfile → built-in `default@1.0.0`.
 *
 * @param input - registry + config knobs
 */
export function resolveNarrativePromptProfile(input: {
  readonly registry: PromptProfileRegistry;
  readonly model: string;
  /** `agents.promptProfiles`: model alias → `id@version`. */
  readonly profilesByModel?: Readonly<Record<string, string>>;
  /** `agents.defaultPromptProfile`: fallback ref. */
  readonly defaultProfile?: string;
  /** `agents.promptProfileOverride`: wins over mapping + fallback. */
  readonly override?: string;
}): Result<{ readonly profile: NarrativePromptProfile; readonly ref: string }, Failure> {
  const ref =
    input.override?.trim() ||
    input.profilesByModel?.[input.model]?.trim() ||
    input.defaultProfile?.trim() ||
    BUILTIN_DEFAULT_PROFILE_REF;
  const profile = input.registry.get(ref);
  if (!profile) {
    return err(
      failure(
        "CONFIG_INVALID",
        `unknown narrative prompt profile "${ref}" (not found in registry)`,
        { details: { ref, model: input.model } },
      ),
    );
  }
  return ok({ profile, ref });
}

function loadProfileFile(
  dir: string,
  name: string,
): Result<NarrativePromptProfile, Failure> {
  const path = join(dir, name);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return err(
      failure("CONFIG_INVALID", `failed to read prompt profile file "${path}"`, {
        details: { path, error: String(error) },
      }),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return err(
      failure("CONFIG_INVALID", `prompt profile file "${path}" is not valid JSON`, {
        details: { path, error: String(error) },
      }),
    );
  }
  const schemaResult = NarrativePromptProfileSchema.safeParse(parsed);
  if (!schemaResult.success) {
    return err(
      failure("CONFIG_INVALID", `prompt profile file "${path}" failed schema`, {
        details: { path, issues: schemaResult.error.flatten() },
      }),
    );
  }
  const profile = schemaResult.data;

  const expectedName = `${profile.id}@${profile.version}.json`;
  if (name !== expectedName) {
    return err(
      failure(
        "CONFIG_INVALID",
        `prompt profile file "${path}" must be named "${expectedName}" to match id/version`,
        { details: { path, expectedName } },
      ),
    );
  }

  for (const [field, template] of [
    ["systemCore", profile.systemCore],
    ["rulesReminder", profile.rulesReminder],
  ] as const) {
    const check = validatePromptTemplate(
      template,
      NARRATIVE_PROMPT_FIELD_PLACEHOLDERS[field],
    );
    if (!check.ok) {
      return err(
        failure("CONFIG_INVALID", `prompt profile "${path}" ${check.error.message}`, {
          details: { path, field, ...(check.error.details as object) },
        }),
      );
    }
  }
  for (const instruction of profile.repair.instructions) {
    const check = validatePromptTemplate(
      instruction,
      NARRATIVE_PROMPT_FIELD_PLACEHOLDERS["repair.instructions"],
    );
    if (!check.ok) {
      return err(
        failure(
          "CONFIG_INVALID",
          `prompt profile "${path}" ${check.error.message}`,
          { details: { path, field: "repair.instructions", ...(check.error.details as object) } },
        ),
      );
    }
  }

  return ok(profile);
}

function isDirMissing(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === "ENOENT";
}
