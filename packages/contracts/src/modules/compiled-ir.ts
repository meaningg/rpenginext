import type { ModuleManifest } from "./manifest.ts";

/**
 * Compiled Module IR version.
 * Core / sdk may support N and N-1 during transitions (specs/01 §5.2).
 */
export const MODULE_IR_VERSION = 1 as const;

export type ModuleIrVersion = typeof MODULE_IR_VERSION;

/**
 * IR versions accepted by the current engine.
 *
 * Platform 1.0 ships exactly one IR version (N-1 does not exist before the
 * first release); the list exists so a future major bump can add N-1 loaders
 * or document a hard cut with a migration guide (specs/01 §5.2).
 * Boot rejects manifests outside this set with `MODULE_ENGINES_INCOMPATIBLE`.
 */
export const SUPPORTED_MODULE_IR_VERSIONS: readonly ModuleIrVersion[] = [
  MODULE_IR_VERSION,
] as const;

/**
 * Declarative op descriptor in IR (handlers live beside IR at runtime).
 */
export interface CompiledOpIr {
  readonly name: string;
  readonly commandType: string;
  readonly hasPayloadSchema: boolean;
}

/**
 * Declarative slice descriptor.
 */
export interface CompiledSliceIr {
  readonly name: string;
  readonly schemaVersion: number;
  readonly ops: readonly CompiledOpIr[];
  readonly hasMigrations: boolean;
}

/**
 * Which author moments are bound (functions are not serializable).
 */
export interface CompiledMomentsIr {
  readonly seed: boolean;
  readonly guard: boolean;
  readonly soft: boolean;
  readonly invariant: boolean;
  readonly change: boolean;
  readonly afterProse: boolean;
  readonly committed: boolean;
  readonly rejected: boolean;
  readonly load: boolean;
  readonly narrativeSystem: boolean;
  readonly narrativeUser: boolean;
  readonly narrativeBrief: boolean;
  readonly narrativeHistory: boolean;
  readonly narrativeStyle: boolean;
  readonly narrativeCritic: boolean;
  readonly hostStatus: boolean;
  readonly hostHelp: boolean;
  readonly hostReadModels: readonly string[];
}

/**
 * Declarative event emitter descriptor in IR (specs/06 §7).
 */
export interface CompiledEventEmitIr {
  readonly name: string;
  readonly hasSchema: boolean;
  readonly description?: string;
}

/**
 * Declarative event subscription descriptor in IR.
 */
export interface CompiledEventSubscribeIr {
  readonly name: string;
  readonly priority: number;
}

/**
 * Declarative events surface (handlers live beside IR at runtime).
 */
export interface CompiledEventsIr {
  readonly emit: readonly CompiledEventEmitIr[];
  readonly subscribe: readonly CompiledEventSubscribeIr[];
}

/**
 * Declarative module lifecycle flags (handlers live beside IR at runtime).
 */
export interface CompiledLifecycleIr {
  readonly init: boolean;
  readonly shutdown: boolean;
}

export interface CompiledAiTaskIr {
  readonly localKey: string;
  readonly type: string;
  readonly optional: boolean;
  readonly tools: readonly string[];
  readonly systemReason?: string;
}

export interface CompiledAiToolIr {
  readonly localKey: string;
  readonly id: string;
}

/**
 * Stable intermediate representation of an sdk module after compile.
 *
 * - Serialisable / goldenable (no functions).
 * - Authors never write IR by hand — only `defineModule`.
 * - Runtime handlers live in bindings; core/sdk **bind table-driven from IR.moments**.
 *
 * @see docs/adr/0004-module-sdk-cbmd.md
 */
export interface CompiledModuleIR {
  readonly irVersion: ModuleIrVersion;
  readonly sdkVersion: string;
  readonly manifest: ModuleManifest;
  readonly slice?: CompiledSliceIr;
  readonly configKey?: string;
  readonly allowedReadSlices: readonly string[];
  readonly moments: CompiledMomentsIr;
  readonly aiTasks: readonly CompiledAiTaskIr[];
  readonly aiTools: readonly CompiledAiToolIr[];
  readonly capabilityKinds: readonly string[];
  readonly lifecycle: CompiledLifecycleIr;
  readonly events: CompiledEventsIr;
}

/**
 * Runtime handle: IR + installer that **must** bind strictly from IR.
 * This is the foundation unit between module-sdk and core.
 */
export interface CompiledModule {
  readonly ir: CompiledModuleIR;
  /**
   * Table-driven install: only moments/catalogs declared in {@link ir} are bound.
   * Single supported load path for product modules.
   */
  readonly install: (ctx: import("./register-context.ts").ModuleRegisterContext) => void;
}
