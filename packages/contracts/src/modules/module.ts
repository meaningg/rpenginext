import type { Result, Failure } from "../result.ts";
import type { ModuleManifest } from "./manifest.ts";
import type { ModuleRegisterContext } from "./register-context.ts";
import type { TurnLogger } from "../turn/context.ts";
import type { CompiledModule, CompiledModuleIR } from "./compiled-ir.ts";

/**
 * Lifecycle context for start/stop (no world commit rights).
 */
export interface ModuleLifecycleContext {
  readonly manifest: ModuleManifest;
  readonly log: TurnLogger;
}

/**
 * Runtime module loaded by core.
 *
 * **Product modules (foundation path):** carry {@link compiled} IR handle.
 * Core installs via `compiled.install` (IR loader). Authors never implement this.
 *
 * **Core-internal test fixtures only** may omit `compiled` and use bare `register`.
 * That is not an author / third-party path.
 */
export interface Module {
  readonly manifest: ModuleManifest;
  /**
   * First-class compiled IR from `@rpengineext/module-sdk`.
   * When present, core uses the IR loader (`compiled.install`).
   */
  readonly compiled?: CompiledModule;
  /**
   * Convenience alias of `compiled.ir` when present.
   */
  readonly ir?: CompiledModuleIR;
  /**
   * Installs contributions. For sdk modules this delegates to IR install.
   * Must not touch session state.
   *
   * @param ctx - contribution bus (engine-internal)
   */
  register(ctx: ModuleRegisterContext): void | Result<void, Failure>;
  /**
   * Optional warm-up after graph validation.
   *
   * @param ctx - lifecycle context
   */
  start?(ctx: ModuleLifecycleContext): Promise<void> | void;
  /**
   * Optional teardown.
   *
   * @param ctx - lifecycle context
   */
  stop?(ctx: ModuleLifecycleContext): Promise<void> | void;
}

/**
 * Factory signature used by host/module loaders.
 */
export type ModuleFactory = () => Module | Promise<Module>;
