/**
 * `@rpengineext/host-bootstrap` — shared CLI/API composition root.
 *
 * @packageDocumentation
 */

export {
  createHostRuntime,
  type CreateHostRuntimeOptions,
  type HostRuntime,
  type HostModuleInfo,
  resolveHostModules,
} from "./create-host-runtime.ts";
export { HOST_ENV, readHostEnv, type HostEnv } from "./env.ts";
export {
  MODULE_CATALOG,
  MODULE_PROFILES,
  MODULE_PROFILE_IDS,
  type ModuleProfileId,
  expandProfile,
  instantiateFromCatalog,
  dedupeIds,
} from "./module-catalog.ts";
