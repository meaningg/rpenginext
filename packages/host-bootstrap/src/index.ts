/**
 * `@rpengineext/host-bootstrap` — shared CLI/API composition root.
 *
 * @packageDocumentation
 */

export {
  createHostRuntime,
  type CreateHostRuntimeOptions,
  type HostRuntime,
} from "./create-host-runtime.ts";
export { HOST_ENV, readHostEnv, type HostEnv } from "./env.ts";
