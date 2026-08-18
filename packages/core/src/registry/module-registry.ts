import {
  CONTRACTS_VERSION,
  CORE_STATE_CAPABILITY,
  effectiveContributes,
  err,
  failure,
  MODULE_IR_VERSION,
  ok,
  parseModuleManifest,
  type Failure,
  type Module,
  type ModuleFactory,
  type ModuleManifest,
  type PermissionToken,
  type Result,
  type TurnLogger,
} from "@rpengineext/contracts";

import { CORE_VERSION } from "../version.ts";
import { satisfiesRange } from "../util/semver.ts";
import { ContributionIndex } from "./contribution-index.ts";
import { validateCapabilityGraph } from "./capability-graph.ts";
import { createRegisterContext } from "./register-context.ts";

export interface LoadedModule {
  readonly module: Module;
  readonly priority: number;
  readonly permissions: readonly PermissionToken[];
}

export interface ModuleRegistryBootResult {
  readonly modules: readonly LoadedModule[];
  readonly index: ContributionIndex;
  readonly providedCapabilities: ReadonlySet<string>;
}

export interface ModuleRegistryOptions {
  readonly log: TurnLogger;
  readonly coreVersion?: string;
  readonly contractsVersion?: string;
  readonly failOnMissingCapability?: boolean;
  readonly strictManifest?: boolean;
  /** Host moduleConfig forwarded into ModuleRegisterContext at install. */
  readonly moduleConfig?: import("@rpengineext/contracts").JsonObject;
}

/**
 * Loads modules, validates manifests/graph, collects contributions.
 */
export class ModuleRegistry {
  private readonly log: TurnLogger;
  private readonly coreVersion: string;
  private readonly contractsVersion: string;
  private readonly failOnMissingCapability: boolean;
  private readonly strictManifest: boolean;
  private readonly moduleConfig: import("@rpengineext/contracts").JsonObject;
  private loaded: LoadedModule[] = [];
  private index = new ContributionIndex();
  private started = false;
  private readonly permissionsByModule = new Map<string, readonly PermissionToken[]>();

  /**
   * @param options - registry options
   */
  constructor(options: ModuleRegistryOptions) {
    this.log = options.log.child({ component: "module-registry" });
    this.coreVersion = options.coreVersion ?? CORE_VERSION;
    this.contractsVersion = options.contractsVersion ?? CONTRACTS_VERSION;
    this.failOnMissingCapability = options.failOnMissingCapability !== false;
    this.strictManifest = options.strictManifest === true;
    this.moduleConfig = options.moduleConfig ?? {};
  }

  /**
   * Returns contribution index after successful boot.
   */
  getIndex(): ContributionIndex {
    return this.index;
  }

  /**
   * Returns loaded modules in deterministic order.
   */
  getModules(): readonly LoadedModule[] {
    return this.loaded;
  }

  /**
   * Returns manifest permissions for a module id.
   *
   * @param moduleId - module id
   */
  getModulePermissions(moduleId: string): readonly PermissionToken[] {
    return this.permissionsByModule.get(moduleId) ?? [];
  }

  /**
   * Loads factories/instances, registers contributions, validates graph.
   *
   * @param modules - module instances or factories
   */
  async boot(
    modules: readonly (Module | ModuleFactory)[] = [],
  ): Promise<Result<ModuleRegistryBootResult, Failure>> {
    this.index = new ContributionIndex();
    this.index.addCapability(CORE_STATE_CAPABILITY);
    this.loaded = [];
    this.permissionsByModule.clear();

    const resolved: Module[] = [];
    for (const entry of modules) {
      try {
        const mod = typeof entry === "function" ? await entry() : entry;
        resolved.push(mod);
      } catch (error) {
        return err(
          failure("REGISTRATION_INVALID", "module factory threw", {
            details: String(error),
          }),
        );
      }
    }

    const seen = new Set<string>();
    const parsedModules: { module: Module; manifest: ModuleManifest }[] = [];
    for (const mod of resolved) {
      const parsed = parseModuleManifest(mod.manifest);
      if (!parsed.success) {
        return err(
          failure("MANIFEST_INVALID", "module manifest failed schema validation", {
            details: parsed.error.flatten(),
          }),
        );
      }
      const manifest = parsed.data;
      if (seen.has(manifest.id)) {
        return err(
          failure("DUPLICATE_MODULE", `duplicate module id: ${manifest.id}`),
        );
      }
      seen.add(manifest.id);

      const coreOk = satisfiesRange(this.coreVersion, manifest.engines.core);
      if (!coreOk.ok) {
        return err(
          failure(
            "ENGINE_MISMATCH",
            `module ${manifest.id} engines.core ${manifest.engines.core} incompatible with core ${this.coreVersion}`,
            { causedBy: [manifest.id] },
          ),
        );
      }
      const contractsOk = satisfiesRange(
        this.contractsVersion,
        manifest.engines.contracts,
      );
      if (!contractsOk.ok) {
        return err(
          failure(
            "ENGINE_MISMATCH",
            `module ${manifest.id} engines.contracts ${manifest.engines.contracts} incompatible with contracts ${this.contractsVersion}`,
            { causedBy: [manifest.id] },
          ),
        );
      }

      parsedModules.push({ module: mod, manifest });
    }

    // Capability filtering when failOnMissingCapability is false
    let active = parsedModules;
    if (!this.failOnMissingCapability) {
      const provided = new Set<string>([CORE_STATE_CAPABILITY]);
      for (const item of parsedModules) {
        for (const cap of item.manifest.provides) provided.add(cap);
      }
      active = [];
      for (const item of parsedModules) {
        const missing = item.manifest.requires.filter((req) => !provided.has(req));
        if (missing.length > 0) {
          this.log.warn(
            { moduleId: item.manifest.id, missing },
            "skipping module due to missing capabilities",
          );
          continue;
        }
        active.push(item);
      }
    }

    const ordered = [...active].sort((a, b) => {
      if (a.manifest.priority !== b.manifest.priority) {
        return a.manifest.priority - b.manifest.priority;
      }
      return a.manifest.id.localeCompare(b.manifest.id);
    });

    const graphResult = validateCapabilityGraph(ordered.map((item) => item.manifest));
    if (!graphResult.ok) {
      if (this.failOnMissingCapability) {
        return graphResult;
      }
      // Should not happen after filter; still surface cycles etc.
      if (graphResult.error.code === "CAPABILITY_CYCLE") {
        return graphResult;
      }
    }

    for (const item of ordered) {
      const { module: mod, manifest } = item;
      const bundle = createRegisterContext(
        manifest,
        this.log.child({ moduleId: manifest.id }),
        this.index,
        {
          strictManifest: this.strictManifest,
          effectiveContributes: effectiveContributes(manifest),
          moduleConfig: this.moduleConfig,
        },
      );
      try {
        /**
         * Foundation load path: CompiledModule IR installer from module-sdk.
         * Fallback `register()` is for core-internal fixtures only.
         */
        if (mod.compiled) {
          const ir = mod.compiled.ir;
          if (ir.irVersion !== MODULE_IR_VERSION) {
            return err(
              failure(
                "ENGINE_MISMATCH",
                `module ${manifest.id} IR v${ir.irVersion} unsupported (engine supports v${MODULE_IR_VERSION})`,
                { causedBy: [manifest.id] },
              ),
            );
          }
          if (ir.manifest.id !== manifest.id) {
            return err(
              failure(
                "REGISTRATION_INVALID",
                `module ${manifest.id} IR manifest id mismatch`,
                { causedBy: [manifest.id] },
              ),
            );
          }
          if (ir.manifest.version !== manifest.version) {
            return err(
              failure(
                "REGISTRATION_INVALID",
                `module ${manifest.id} IR manifest version mismatch`,
                { causedBy: [manifest.id] },
              ),
            );
          }
          mod.compiled.install(bundle.ctx);
          this.log.info(
            {
              moduleId: manifest.id,
              irVersion: ir.irVersion,
              sdkVersion: ir.sdkVersion,
              loadPath: "compiled-ir",
            },
            "module installed via IR loader",
          );
        } else {
          const result = mod.register(bundle.ctx);
          if (result && typeof result === "object" && "ok" in result && !result.ok) {
            return err(result.error);
          }
          this.log.info(
            { moduleId: manifest.id, loadPath: "register-fixture" },
            "module registered (core fixture path; not author API)",
          );
        }
      } catch (error) {
        return err(
          failure(
            "REGISTRATION_INVALID",
            `module ${manifest.id} install/register threw`,
            { details: String(error), causedBy: [manifest.id] },
          ),
        );
      }

      const ignored = bundle.takeErrors();
      if (ignored.length > 0) {
        return err(ignored[0]!);
      }

      for (const cap of manifest.provides) {
        this.index.addCapability(cap);
      }

      const permissions = Object.freeze([...manifest.permissions]) as readonly PermissionToken[];
      this.permissionsByModule.set(manifest.id, permissions);
      this.loaded.push({
        module: mod,
        priority: manifest.priority,
        permissions,
      });
      this.log.info(
        { moduleId: manifest.id, version: manifest.version },
        "module registered",
      );
    }

    this.index.sortAll();

    return ok({
      modules: this.loaded,
      index: this.index,
      providedCapabilities:
        graphResult.ok
          ? graphResult.value.provided
          : new Set<string>([CORE_STATE_CAPABILITY]),
    });
  }

  /**
   * Invokes module start hooks.
   */
  async startAll(): Promise<Result<void, Failure>> {
    for (const loaded of this.loaded) {
      if (!loaded.module.start) continue;
      try {
        await loaded.module.start({
          manifest: loaded.module.manifest,
          log: this.log.child({ moduleId: loaded.module.manifest.id }),
        });
      } catch (error) {
        return err(
          failure(
            "MODULE_ERROR",
            `module ${loaded.module.manifest.id} start() failed`,
            {
              details: String(error),
              causedBy: [loaded.module.manifest.id],
            },
          ),
        );
      }
    }
    this.started = true;
    return ok(undefined);
  }

  /**
   * Invokes module stop hooks (reverse order).
   */
  async stopAll(): Promise<Result<void, Failure>> {
    const reverse = [...this.loaded].reverse();
    for (const loaded of reverse) {
      if (!loaded.module.stop) continue;
      try {
        await loaded.module.stop({
          manifest: loaded.module.manifest,
          log: this.log.child({ moduleId: loaded.module.manifest.id }),
        });
      } catch (error) {
        this.log.error(
          {
            moduleId: loaded.module.manifest.id,
            err: String(error),
          },
          "module stop() failed",
        );
      }
    }
    this.started = false;
    return ok(undefined);
  }

  /**
   * Whether startAll completed.
   */
  isStarted(): boolean {
    return this.started;
  }
}
