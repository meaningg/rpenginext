import type {
  AccessCapability,
  AiCapability,
  ConfigCapability,
  EventsCapability,
  HostCapability,
  NarrativeCapability,
  RulesCapability,
  SeedCapability,
  StateCapability,
  TurnCapability,
} from "../types/capabilities.ts";

/**
 * @param def - state capability fields
 */
export function stateCap(
  def: Omit<StateCapability, "kind">,
): StateCapability {
  return { kind: "state", ...def };
}

/**
 * @param def - seed capability fields
 */
export function seedCap(def: Omit<SeedCapability, "kind">): SeedCapability {
  return { kind: "seed", ...def };
}

/**
 * @param def - rules capability fields
 */
export function rulesCap(def: Omit<RulesCapability, "kind">): RulesCapability {
  return { kind: "rules", ...def };
}

/**
 * @param def - turn capability fields
 */
export function turnCap(def: Omit<TurnCapability, "kind">): TurnCapability {
  return { kind: "turn", ...def };
}

/**
 * @param def - narrative capability fields
 */
export function narrativeCap(
  def: Omit<NarrativeCapability, "kind">,
): NarrativeCapability {
  return { kind: "narrative", ...def };
}

/**
 * @param def - ai capability fields
 */
export function aiCap(def: Omit<AiCapability, "kind">): AiCapability {
  return { kind: "ai", ...def };
}

/**
 * @param def - host capability fields
 */
export function hostCap(def: Omit<HostCapability, "kind">): HostCapability {
  return { kind: "host", ...def };
}

/**
 * @param def - config capability fields
 */
export function configCap(
  def: Omit<ConfigCapability, "kind">,
): ConfigCapability {
  return { kind: "config", ...def };
}

/**
 * @param def - access capability fields
 */
export function accessCap(
  def: Omit<AccessCapability, "kind">,
): AccessCapability {
  return { kind: "access", ...def };
}

/**
 * @param def - events capability fields (specs/06 §7)
 */
export function eventsCap(
  def: Omit<EventsCapability, "kind">,
): EventsCapability {
  return { kind: "events", ...def };
}
