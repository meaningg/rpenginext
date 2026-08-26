import {
  err,
  failure,
  ok,
  type CompiledModule,
  type Failure,
  type JsonObject,
  type Module,
  type ModuleLifecycleContext,
  type ModuleRegisterContext,
  type Result,
} from "@rpengineext/contracts";

import type { NormalizedModuleDefinition } from "../types/definition.ts";
import { defaultSliceName } from "../util/ids.ts";
import { bindCompiledModule } from "./bind-compiled-module.ts";
import { buildBindings } from "./bindings.ts";
import { buildManifestAndIr } from "./build-ir.ts";
import { createModuleCtx } from "./create-ctx.ts";

/**
 * Compiles a normalized CBMD definition into a runtime Module (IR + bindings).
 *
 * Foundation path:
 *   definition → bindings + IR → Module.compiled.install = bindCompiledModule(ir, bindings)
 *
 * Lifecycle hooks (specs/06 §8): `init` runs once after boot validation
 * (no world access — op/emit/deny/readModel fail-loud), `shutdown` runs at
 * engine stop (cleanup only, reverse priority order).
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

    const lifecycleCtxLog = (lctx: ModuleLifecycleContext) =>
      lctx.log.child({ moduleId: normalized.id, component: "lifecycle" });

    const start = normalized.init
      ? async (lctx: ModuleLifecycleContext): Promise<void> => {
          const config = bindings.config
            ? (readConfigSection(
                bindings.config.hostModuleConfig ??
                  runtimeConfig?.moduleConfig,
                bindings.config.key,
                bindings.config.defaults,
              ) as JsonObject)
            : ({} as JsonObject);
          const { ctx: mctx } = createModuleCtx({
            moduleId: normalized.id,
            sliceName,
            slice: undefined,
            config,
            meta: {},
            log: lifecycleCtxLog(lctx),
            knownOps: bindings.knownOps,
            opMode: "collect",
            momentName: "init",
            writeAllowed: false,
            emitAllowed: false,
            scheduleAllowed: false,
          });
          await normalized.init!(mctx);
        }
      : undefined;

    const stop = normalized.shutdown
      ? async (lctx: ModuleLifecycleContext): Promise<void> => {
          await normalized.shutdown!();
          lifecycleCtxLog(lctx).debug("module shutdown complete");
        }
      : undefined;

    const module: Module = {
      manifest,
      compiled,
      ir,
      register(ctx: ModuleRegisterContext) {
        // Core product path uses compiled.install; register delegates for symmetry.
        install(ctx);
      },
      ...(start ? { start } : {}),
      ...(stop ? { stop } : {}),
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

/**
 * Reads the host moduleConfig section for a module config key, merged over defaults.
 * Mirrors the bind-time resolution so init sees the same config as moments.
 */
function readConfigSection(
  bag: JsonObject | undefined,
  key: string,
  defaults: JsonObject,
): JsonObject {
  const section = bag?.[key];
  if (section && typeof section === "object" && !Array.isArray(section)) {
    return { ...defaults, ...(section as JsonObject) };
  }
  return { ...defaults };
}