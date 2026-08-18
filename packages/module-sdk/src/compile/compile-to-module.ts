import {
  err,
  failure,
  ok,
  type CompiledModule,
  type Failure,
  type JsonObject,
  type Module,
  type ModuleRegisterContext,
  type Result,
} from "@rpengineext/contracts";

import type { NormalizedModuleDefinition } from "../types/definition.ts";
import { defaultSliceName } from "../util/ids.ts";
import { bindCompiledModule } from "./bind-compiled-module.ts";
import { buildBindings } from "./bindings.ts";
import { buildManifestAndIr } from "./build-ir.ts";

/**
 * Compiles a normalized CBMD definition into a runtime Module (IR + bindings).
 *
 * Foundation path:
 *   definition → bindings + IR → Module.compiled.install = bindCompiledModule(ir, bindings)
 *
 * @param normalized - validated definition
 * @param runtimeConfig - optional factory/host config snapshot
 */
export function compileToModule(
  normalized: NormalizedModuleDefinition,
  runtimeConfig?: {
    readonly moduleConfig?: JsonObject;
    readonly factoryConfig?: JsonObject;
  },
): Result<Module, Failure> {
  try {
    const stateCap = normalized.capabilities.find((c) => c.kind === "state");
    const sliceName =
      stateCap && stateCap.kind === "state"
        ? (stateCap.name ?? defaultSliceName(normalized.id))
        : defaultSliceName(normalized.id);

    const bindings = buildBindings(normalized, runtimeConfig, sliceName);
    const { manifest, ir } = buildManifestAndIr(normalized, bindings);

    // Cross-check IR moments vs contributes (defensive)
    if (ir.manifest.id !== manifest.id) {
      return err(failure("SCHEMA_INVALID", "IR/manifest id mismatch"));
    }

    const install = (ctx: ModuleRegisterContext): void => {
      bindCompiledModule(ctx, ir, bindings);
    };

    const compiled: CompiledModule = { ir, install };

    const module: Module = {
      manifest,
      compiled,
      ir,
      register(ctx: ModuleRegisterContext) {
        // Core product path uses compiled.install; register delegates for symmetry.
        install(ctx);
      },
    };

    return ok(module);
  } catch (e) {
    return err(
      failure(
        "REGISTRATION_INVALID",
        e instanceof Error ? e.message : "compileToModule failed",
        { details: String(e) },
      ),
    );
  }
}
