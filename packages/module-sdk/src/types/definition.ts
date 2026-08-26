import type { JsonObject } from "@rpengineext/contracts";

import type { Capability } from "./capabilities.ts";
import type {
  AiCapability,
  ConfigCapability,
  EventsCapability,
  HostCapability,
  NarrativeCapability,
  RulesCapability,
  SeedCapability,
  StateCapability,
  TurnCapability,
  AccessCapability,
} from "./capabilities.ts";
import type { ModuleCtx } from "./context.ts";

/**
 * Author module definition (sugar object and/or capabilities array).
 * Both forms normalize to the same capability list.
 *
 * @typeParam TSlice - primary state slice type (inferred from `state.initial` / schema)
 * @typeParam TConfig - module config section type
 */
export interface ModuleDefinition<
  TSlice = JsonObject,
  TConfig extends JsonObject = JsonObject,
> {
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
  readonly state?: Omit<StateCapability<TSlice>, "kind">;
  readonly seed?: Omit<SeedCapability<TSlice, TConfig>, "kind">;
  readonly rules?: Omit<RulesCapability<TSlice, TConfig>, "kind">;
  readonly turn?: Omit<TurnCapability<TSlice, TConfig>, "kind">;
  readonly narrative?: Omit<NarrativeCapability<TSlice, TConfig>, "kind">;
  readonly ai?: Omit<AiCapability<TSlice, TConfig>, "kind">;
  readonly host?: Omit<HostCapability<TSlice, TConfig>, "kind">;
  readonly config?: Omit<ConfigCapability<TConfig>, "kind">;
  readonly access?: Omit<AccessCapability, "kind">;
  readonly events?: Omit<EventsCapability<TSlice, TConfig>, "kind">;

  /**
   * Module lifecycle (specs/06 §8): once after boot validation, before first turn.
   * `init` must not touch world state (op / emit / deny / readModel → fail-loud).
   */
  readonly init?: (ctx: ModuleCtx<TSlice, TConfig>) => void | Promise<void>;
  /** Cleanup-only hook called at engine stop (reverse priority order). */
  readonly shutdown?: () => void | Promise<void>;
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
  readonly init?: (
    ctx: import("./context.ts").ModuleCtx<any, any>,
  ) => void | Promise<void>;
  readonly shutdown?: () => void | Promise<void>;
}
