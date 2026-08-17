/**
 * Semver of the published contracts surface.
 * Modules declare `engines.contracts` against this value.
 */
export const CONTRACTS_VERSION = "0.1.0" as const;

/**
 * Capability id always provided by core (state kernel).
 */
export const CORE_STATE_CAPABILITY = "capability:state-core" as const;

/**
 * Snapshot / journal wire format version owned by contracts shape.
 */
export const SESSION_FORMAT_VERSION = 1 as const;

/**
 * Turn markdown trace format version (renderer must match).
 */
export const TRACE_FORMAT_VERSION = 1 as const;
