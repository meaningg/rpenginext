import { z } from "zod";

const KEBAB_CASE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Zod schema for a narrative prompt profile JSON file (ADR 0007).
 *
 * Validated at boot: unknown placeholders, malformed semver or non-kebab
 * ids fail with `CONFIG_INVALID`.
 */
export const NarrativePromptProfileSchema = z.object({
  /** Kebab-case profile id, unique within the registry. */
  id: z
    .string()
    .min(1)
    .regex(KEBAB_CASE_RE, "id must be kebab-case (a-z, 0-9, dashes)"),
  /** Semver version; file name must be `{id}@{version}.json`. */
  version: z.string().regex(SEMVER_RE, "version must be semver (e.g. 1.0.0)"),
  /** Optional human note (target model / intent). */
  description: z.string().optional(),
  labels: z.object({
    /** Label marking the current player action in the final user message. */
    playerAction: z.string().min(1),
  }),
  /** System prompt core; template with `{{...}}` placeholders. */
  systemCore: z.string().min(1),
  /** Short rules reminder appended to the current action user message. */
  rulesReminder: z.string().min(1),
  repair: z.object({
    title: z.string().min(1),
    /** Instruction lines; may contain `{{issues}}` / `{{hints}}`. */
    instructions: z.array(z.string().min(1)).min(1),
    hintsTitle: z.string().min(1),
  }),
  /**
   * Default constraints for `narrative.write`, used only when the task does
   * not define them explicitly (D4). Optional; engine defaults apply when absent.
   */
  constraints: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxRepairAttempts: z.number().int().min(0).optional(),
    })
    .optional(),
});

/** A validated narrative prompt profile (ADR 0007). */
export type NarrativePromptProfile = z.infer<
  typeof NarrativePromptProfileSchema
>;

/**
 * Renders `id@version` registry reference for a profile.
 *
 * @param profile - profile with id + version
 */
export function profileRefOf(profile: {
  readonly id: string;
  readonly version: string;
}): string {
  return `${profile.id}@${profile.version}`;
}
