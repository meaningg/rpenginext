import {
  err,
  failure,
  ok,
  type Failure,
  type JsonObject,
  type Module,
  type Result,
} from "@rpengineext/contracts";

import { compileToModule } from "./compile/compile-to-module.ts";
import { normalizeModuleDefinition } from "./compile/normalize.ts";
import type { ModuleDefinition } from "./types/definition.ts";
import type { NormalizedModuleDefinition } from "./types/definition.ts";

export interface DefineModuleOptions {
  /**
   * Optional host moduleConfig bag (usually omitted; core validates at boot).
   * Factory-time config overrides (e.g. working-memory windowPairs).
   */
  readonly factoryConfig?: JsonObject;
  readonly moduleConfig?: JsonObject;
}

export interface DefinedModule extends Module {
  /** Normalized author definition (debug / tooling). */
  readonly definition: NormalizedModuleDefinition;
  /** Always present — foundation IR artifact. */
  readonly ir: NonNullable<Module["ir"]>;
  /** Always present — IR installer handle for core. */
  readonly compiled: NonNullable<Module["compiled"]>;
}

/**
 * Defines a product module (only supported author entry point).
 *
 * @typeParam TSlice - primary state slice type (inferred from definition)
 * @typeParam TConfig - module config section type
 * @param def - module definition (capabilities and/or object sugar)
 * @param options - optional factory config snapshot
 */
export function defineModule<
  TSlice = JsonObject,
  TConfig extends JsonObject = JsonObject,
>(
  def: ModuleDefinition<TSlice, TConfig>,
  options: DefineModuleOptions = {},
): DefinedModule {
  const normalized = normalizeModuleDefinition(def);
  if (!normalized.ok) {
    throw new Error(
      `defineModule(${def.id ?? "?"}): ${normalized.error.code} ${normalized.error.message}`,
    );
  }
  const compiled = compileToModule(normalized.value, {
    factoryConfig: options.factoryConfig,
    moduleConfig: options.moduleConfig,
  });
  if (!compiled.ok) {
    throw new Error(
      `defineModule(${def.id}): ${compiled.error.code} ${compiled.error.message}`,
    );
  }
  const mod = compiled.value;
  if (!mod.compiled || !mod.ir) {
    throw new Error(`defineModule(${def.id}): compile missing IR handle`);
  }
  return {
    ...mod,
    compiled: mod.compiled,
    ir: mod.ir,
    definition: normalized.value,
  };
}

/**
 * Safe variant returning Result instead of throw.
 *
 * @typeParam TSlice - primary state slice type (inferred from definition)
 * @typeParam TConfig - module config section type
 * @param def - module definition
 * @param options - optional factory config
 */
export function tryDefineModule<
  TSlice = JsonObject,
  TConfig extends JsonObject = JsonObject,
>(
  def: ModuleDefinition<TSlice, TConfig>,
  options: DefineModuleOptions = {},
): Result<DefinedModule, Failure> {
  try {
    return ok(defineModule(def, options));
  } catch (e) {
    return err(
      failure(
        "SCHEMA_INVALID",
        e instanceof Error ? e.message : "defineModule failed",
      ),
    );
  }
}
