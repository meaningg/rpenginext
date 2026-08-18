import type { Capability } from "./capabilities.ts";
import type {
  AiCapability,
  ConfigCapability,
  HostCapability,
  NarrativeCapability,
  RulesCapability,
  SeedCapability,
  StateCapability,
  TurnCapability,
  AccessCapability,
} from "./capabilities.ts";

/**
 * Author module definition (sugar object and/or capabilities array).
 * Both forms normalize to the same capability list.
 */
export interface ModuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description?: string;
  /** Lower runs earlier (default 100). */
  readonly priority?: number;
  readonly provides?: readonly string[];
  readonly requires?: readonly string[];

  /** Composition-first form. */
  readonly capabilities?: readonly Capability[];

  /** Object sugar → capabilities (merged with `capabilities`). */
  readonly state?: Omit<StateCapability, "kind">;
  readonly seed?: Omit<SeedCapability, "kind">;
  readonly rules?: Omit<RulesCapability, "kind">;
  readonly turn?: Omit<TurnCapability, "kind">;
  readonly narrative?: Omit<NarrativeCapability, "kind">;
  readonly ai?: Omit<AiCapability, "kind">;
  readonly host?: Omit<HostCapability, "kind">;
  readonly config?: Omit<ConfigCapability, "kind">;
  readonly access?: Omit<AccessCapability, "kind">;
}

/**
 * Normalized definition after sugar expansion + validation.
 */
export interface NormalizedModuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly priority: number;
  readonly provides: readonly string[];
  readonly requires: readonly string[];
  readonly capabilities: readonly Capability[];
}
