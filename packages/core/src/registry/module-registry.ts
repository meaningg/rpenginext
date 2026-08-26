import {
  CONTRACTS_VERSION,
  CORE_STATE_CAPABILITY,
  effectiveContributes,
  err,
  failure,
  MODULE_IR_VERSION,
  moduleFailure,
  ok,
  parseModuleManifest,
  type Failure,
  type Module,
  type ModuleEventPublisher,
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

/**
 * Extracts the owner module id (with `-` → `_`) from a canonical event name.
 */
function canonicalOwner(name: string): string | undefined {
  const dot = name.indexOf(".");
  if (dot <= 0) return undefined;
  return name.slice(0, dot);
}

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
    const seenSlices = new Map<string, string>();
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
          moduleFailure(
            "MODULE_ID_DUPLICATE",
            `duplicate module id "${manifest.id}" (module: ${manifest.id}). Hint: give each module a unique id.`,
            { moduleId: manifest.id, moduleIds: [manifest.id] },
          ),
        );
      }
      seen.add(manifest.id);

      for (const slice of manifest.stateSlices) {
        const owner = seenSlices.get(slice.name);
        if (owner) {
          return err(
            moduleFailure(
              "MODULE_SLICE_DUPLICATE",
              `duplicate slice name "${slice.name}" owned by modules "${owner}" and "${manifest.id}". Hint: each slice must be owned by exactly one module.`,
              { slice: slice.name, moduleIds: [owner, manifest.id] },
            ),
          );
        }
        seenSlices.set(slice.name, manifest.id);
      }

      const coreOk = satisfiesRange(this.coreVersion, manifest.engines.core);
      if (!coreOk.ok) {
        return err(
          moduleFailure(
            "MODULE_ENGINES_INCOMPATIBLE",
            `module "${manifest.id}" engines.core "${manifest.engines.core}" incompatible with core ${this.coreVersion} (module: ${manifest.id}). Hint: upgrade the module to sdk ^1.0.0 or align engine versions.`,
            { moduleId: manifest.id },
          ),
        );
      }
      const contractsOk = satisfiesRange(
        this.contractsVersion,
        manifest.engines.contracts,
      );
      if (!contractsOk.ok) {
        return err(
          moduleFailure(
            "MODULE_ENGINES_INCOMPATIBLE",
            `module "${manifest.id}" engines.contracts "${manifest.engines.contracts}" incompatible with contracts ${this.contractsVersion} (module: ${manifest.id}). Hint: upgrade the module to sdk ^1.0.0 or align engine versions.`,
            { moduleId: manifest.id },
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
      // Tie-break for equal priority = registration order (stable sort preserves
      // the resolved `base ++ extraModules` list order; specs/04 §4.1.1).
      return a.manifest.priority - b.manifest.priority;
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
              moduleFailure(
                "MODULE_ENGINES_INCOMPATIBLE",
                `module "${manifest.id}" IR v${ir.irVersion} unsupported (engine supports v${MODULE_IR_VERSION}) (module: ${manifest.id}). Hint: recompile with the current module-sdk.`,
                { moduleId: manifest.id },
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

    // --- events binding (specs/06 §7.3) ---
    const binding = this.validateEventBindings();
    if (!binding.ok) return binding;

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
   * Validates static event subscriptions against loaded publishers.
   *
   * - publisher loaded + name unknown (typo) → boot fail `MODULE_EVENT_UNKNOWN`;
   * - publisher not loaded, no capability requires → boot warning + inert subscription;
   * - publisher not loaded with capability requires → fails via capability graph (`MODULE_REQUIRES_MISSING`).
   */
  private validateEventBindings(): Result<void, Failure> {
    const publisherNames = new Set(this.index.eventPublishers.keys());
    const loadedIds = new Set(this.loaded.map((m) => m.module.manifest.id));
    const inert: string[] = [];

    for (const sub of this.index.eventSubscriptions) {
      const subOwner = sub.moduleId;
      if (publisherNames.has(sub.value.name)) continue;

      const publisherModuleId = canonicalOwner(sub.value.name);
      // Manifest ids use dashes; canonical prefixes use underscores.
      const publisherDashId = publisherModuleId?.replace(/_/g, "-");
      if (publisherModuleId && publisherDashId && loadedIds.has(publisherDashId)) {
        // Publisher is loaded but did not declare this name → typo.
        return err(
          moduleFailure(
            "MODULE_EVENT_UNKNOWN",
            `module "${subOwner}" subscribes to unknown event "${sub.value.name}" (publisher module "${publisherModuleId}" is loaded but does not declare it) (module: ${subOwner}). Hint: check the event catalog in the publisher README / events.emit.`,
            { moduleId: subOwner, event: sub.value.name },
          ),
        );
      }
      if (publisherModuleId && !loadedIds.has(publisherModuleId)) {
        // Publisher not loaded: requires on its capability fails elsewhere;
        // otherwise the subscription is inert (documented composition variance).
        this.log.warn(
          { moduleId: subOwner, event: sub.value.name, publisher: publisherModuleId },
          `event subscription inert: publisher module "${publisherModuleId}" not loaded`,
        );
        inert.push(sub.value.name);
        continue;
      }

      // Canonical prefix unknown entirely → typo against the whole catalog.
      return err(
        moduleFailure(
          "MODULE_EVENT_UNKNOWN",
          `module "${subOwner}" subscribes to unknown event "${sub.value.name}" (module: ${subOwner}). Hint: check the event catalog in publisher READMEs / events.emit.`,
          { moduleId: subOwner, event: sub.value.name },
        ),
      );
    }

    if (inert.length > 0) {
      this.index.eventSubscriptions = this.index.eventSubscriptions.filter(
        (sub) => !inert.includes(sub.value.name),
      );
    }
    return ok(undefined);
  }

  /**
   * Invokes module init hooks (specs/06 §8).
   * Init failure → boot fail `MODULE_INIT_FAILED`; engine must not start.
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
          moduleFailure(
            "MODULE_INIT_FAILED",
            `module "${loaded.module.manifest.id}" init() failed (module: ${loaded.module.manifest.id}). Hint: fix the init hook or its external resource; cause: ${error instanceof Error ? error.message : String(error)}.`,
            { moduleId: loaded.module.manifest.id },
          ),
        );
      }
    }
    this.started = true;
    return ok(undefined);
  }

  /**
   * Invokes module shutdown hooks in reverse priority order (specs/06 §8).
   * Errors → warning `MODULE_SHUTDOWN_ERROR`; stop never fails.
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
        this.log.warn(
          {
            moduleId: loaded.module.manifest.id,
            code: "MODULE_SHUTDOWN_ERROR",
            err:
              error instanceof Error ? error.message : String(error),
          },
          `[MODULE_SHUTDOWN_ERROR] module "${loaded.module.manifest.id}" shutdown() failed (module: ${loaded.module.manifest.id}). Hint: shutdown is cleanup only; fix the resource teardown.`,
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
