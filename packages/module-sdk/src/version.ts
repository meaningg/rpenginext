import { MODULE_IR_VERSION as CONTRACTS_IR_VERSION } from "@rpengineext/contracts";

/**
 * Semver of the author-facing Module SDK surface.
 * Bump major on breaking author API / capability merge changes.
 *
 * Normative: frozen at 1.0.0 for Module Platform 1.0 (specs/01, docs/modules/compatibility.md).
 */
export const MODULE_SDK_VERSION = "1.0.0" as const;

/**
 * IR version emitted by this sdk (re-export of contracts constant).
 */
export const MODULE_IR_VERSION = CONTRACTS_IR_VERSION;

/** Core engine range stamped into compiled manifests. */
export const SDK_ENGINES_CORE = "^1.0.0" as const;

/** Contracts range stamped into compiled manifests. */
export const SDK_ENGINES_CONTRACTS = "^1.0.0" as const;