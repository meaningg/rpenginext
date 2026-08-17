import { z } from "zod";

import { PermissionTokenSchema } from "./permissions.ts";
import { CONTRIBUTION_PORT_IDS } from "./extension-ports.ts";

const SemverStringSchema = z
  .string()
  .min(1)
  .regex(
    /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/,
    "expected semver (e.g. 1.0.0)",
  );

const SemverRangeSchema = z.string().min(1);

const ModuleIdSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/,
    "module id must be kebab-case or reverse-domain",
  );

const StateSliceDeclSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/i, "slice name must be an identifier"),
  schemaVersion: z.number().int().positive(),
});

const InterceptorDeclSchema = z.object({
  stage: z.string().min(1),
  when: z.enum(["before", "after", "onError"]),
});

const ContributionPortSchema = z.enum(
  CONTRIBUTION_PORT_IDS as unknown as [string, ...string[]],
);

/**
 * Normative module manifest schema (v1).
 * Supports both legacy `extensionPoints` and wide-surface `contributes`/`registers`/`interceptors`.
 * @see docs/architecture/03-module-system.md
 * @see docs/architecture/12-extension-surface.md
 */
export const ModuleManifestSchema = z
  .object({
    id: ModuleIdSchema,
    version: SemverStringSchema,
    displayName: z.string().min(1),
    description: z.string().default(""),
    engines: z.object({
      core: SemverRangeSchema,
      contracts: SemverRangeSchema,
    }),
    priority: z.number().int(),
    provides: z.array(z.string().min(1)).default([]),
    requires: z.array(z.string().min(1)).default([]),
    permissions: z.array(PermissionTokenSchema).default([]),
    stateSlices: z.array(StateSliceDeclSchema).default([]),
    /** @deprecated prefer `contributes` — kept for template compatibility */
    extensionPoints: z.array(z.string().min(1)).optional(),
    registers: z.array(z.string().min(1)).default([]),
    contributes: z.array(ContributionPortSchema).default([]),
    interceptors: z.array(InterceptorDeclSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    const hasLegacy =
      manifest.extensionPoints !== undefined &&
      manifest.extensionPoints.length > 0;
    const hasWide =
      manifest.contributes.length > 0 ||
      manifest.registers.length > 0 ||
      manifest.interceptors.length > 0;
    if (!hasLegacy && !hasWide && manifest.stateSlices.length === 0) {
      // pure capability provider is allowed; no error
    }
    if (
      hasLegacy &&
      manifest.contributes.length === 0 &&
      manifest.extensionPoints
    ) {
      // bridge: legacy extensionPoints alone is valid
      void ctx;
    }
  });

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

/**
 * Parses and validates a module manifest.
 *
 * @param input - raw JSON value
 */
export function parseModuleManifest(input: unknown) {
  return ModuleManifestSchema.safeParse(input);
}

/**
 * Effective contribution port names from manifest (merges legacy field).
 *
 * @param manifest - validated manifest
 */
export function effectiveContributes(
  manifest: ModuleManifest,
): readonly string[] {
  const fromWide = manifest.contributes;
  const fromLegacy = manifest.extensionPoints ?? [];
  return Object.freeze(Array.from(new Set([...fromWide, ...fromLegacy])));
}
