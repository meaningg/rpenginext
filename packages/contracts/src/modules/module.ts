import type { Result, Failure } from "../result.ts";
import type { ModuleManifest } from "./manifest.ts";
import type { ModuleRegisterContext } from "./register-context.ts";
import type { TurnLogger } from "../turn/context.ts";

/**
 * Lifecycle context for start/stop (no world commit rights).
 */
export interface ModuleLifecycleContext {
  readonly manifest: ModuleManifest;
  readonly log: TurnLogger;
}

/**
 * Module factory product — independent extension package surface.
 */
export interface Module {
  readonly manifest: ModuleManifest;
  /**
   * Registers catalogs, interceptors, and contribution ports.
   * Must not touch session state.
   *
   * @param ctx - registration API
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
