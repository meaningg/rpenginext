/**
 * `@rpengineext/module-sdk` — sole author path for rpengineext modules (CBMD).
 *
 * @packageDocumentation
 */

export { MODULE_IR_VERSION, MODULE_SDK_VERSION } from "./version.ts";

export type {
  CompiledModule,
  CompiledModuleIR,
  CompiledMomentsIr,
  CompiledSliceIr,
} from "@rpengineext/contracts";

export { deny, isModuleDenial, ModuleDenial } from "./deny.ts";

export { defineModule, tryDefineModule } from "./define-module.ts";
export type { DefineModuleOptions, DefinedModule } from "./define-module.ts";

export {
  accessCap,
  aiCap,
  configCap,
  eventsCap,
  hostCap,
  narrativeCap,
  rulesCap,
  seedCap,
  stateCap,
  turnCap,
} from "./capabilities/index.ts";

export type { ModuleCtx, ScheduleSystemRequest } from "./types/context.ts";
export type {
  AccessCapability,
  AiCapability,
  AiTaskDef,
  AiToolDef,
  Capability,
  CapabilityKind,
  ConfigCapability,
  EventsCapability,
  HostCapability,
  HostReadModelDef,
  HostStatusLine,
  NarrativeCapability,
  NarrativeSectionInput,
  RulesCapability,
  SeedCapability,
  SliceOpDef,
  SliceOpFn,
  StateCapability,
  TurnCapability,
} from "./types/capabilities.ts";
export { CAPABILITY_KINDS } from "./types/capabilities.ts";
export type {
  ModuleDefinition,
  NormalizedModuleDefinition,
} from "./types/definition.ts";

export { normalizeModuleDefinition } from "./compile/normalize.ts";
export { asJsonSchema } from "./util/zod-json.ts";
export {
  commandType,
  defaultSliceName,
  namespacedId,
} from "./util/ids.ts";
