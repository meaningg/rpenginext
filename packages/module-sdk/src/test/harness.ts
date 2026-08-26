import {
  ok,
  type Failure,
  type JsonObject,
  type LlmPort,
  type Module,
  type PersistencePort,
  type Result,
  type SavePointer,
  type TurnLogger,
  type TurnResult,
} from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";

export interface TestModuleOptions {
  /** Session meta (seed keys consumed by module seed.apply). */
  readonly meta?: JsonObject;
  /** Host moduleConfig bag (validated on boot → CONFIG_INVALID). */
  readonly moduleConfig?: Readonly<Record<string, JsonObject>>;
  /** LLM port mock (fixed prose or scripted tools). */
  readonly llm?: LlmPort;
  readonly agentsMode?: "mock" | "llm";
  readonly seed?: string;
  /** Strict capability satisfaction (specs/04 — default true). */
  readonly strictCapabilities?: boolean;
  /** Real or in-memory persistence capable of harness save/load. */
  readonly persistence?: PersistencePort;
  /**
   * Load an existing session id instead of starting a fresh one (used with
   * `persistence` for save/migration round-trip tests). Default: new session.
   */
  readonly sessionId?: string;
  /** Logger spy injected into the engine (warnings/behavior assertions). */
  readonly log?: TurnLogger;
}

type TestEngineSuccess = Extract<
  Awaited<ReturnType<typeof createTestEngine>>,
  { ok: true }
>["value"];

export interface ModuleTestHarness {
  /** Booted test engine (advanced escape; prefer harness surface). */
  readonly engine: TestEngineSuccess["engine"];
  readonly runtime: TestEngineSuccess["runtime"];
  readonly sessionId: string;
  /** Boot-time session id (same as {@link sessionId}). */
  readonly modules: readonly {
    readonly id: string;
    readonly version: string;
    readonly priority: number;
  }[];
  /**
   * Submit a free_text player action.
   *
   * @param text - player text
   */
  turn(text: string): Promise<TurnResult>;
  /**
   * Submit any player action.
   *
   * @param action - player action
   */
  action(action: { kind: "free_text"; text: string; clientActionId?: string }): Promise<TurnResult>;
  /**
   * Run an explicit system turn.
   *
   * @param reason - system reason text
   * @param payload - optional payload
   */
  systemTurn(reason: string, payload?: JsonObject): Promise<TurnResult>;
  /**
   * Wait until the session is idle (no busy turn / background system work).
   * Fails on timeout.
   *
   * @param timeoutMs - optional timeout
   */
  waitIdle(timeoutMs?: number): Promise<Result<void, Failure>>;
  /**
   * Saves the session; returns a pointer usable with {@link load}.
   */
  save(): Promise<Result<SavePointer, Failure>>;
  /**
   * Restores a saved session; the harness rebounds to the loaded session.
   *
   * @param pointer - save pointer from {@link save}
   */
  load(pointer: SavePointer): Promise<Result<this, Failure>>;
  /** Read-only view of the current world state. */
  state(): import("@rpengineext/contracts").WorldState | undefined;
  /** Current slice value for the module (first state slice of the first module). */
  slice: unknown;
  /**
   * Reads a slice by name.
   *
   * @param name - slice name
   */
  sliceOf<T = unknown>(name: string): T | undefined;
  /**
   * Resolves a registered readModel (host/engine surface).
   *
   * @param name - readModel id
   * @param args - optional args
   */
  readModel(name: string, args?: JsonObject): unknown;
  /**
   * Dispatched module events log for the current session (read-only; cleared on load).
   */
  events: readonly import("@rpengineext/contracts").ModuleEvent[];
  /** Stops the engine (runs module shutdown hooks). */
  stop(): Promise<void>;
}

/**
 * Boots a test engine with one module and a new session.
 *
 * @param module - compiled module from defineModule
 * @param options - session/meta options
 */
export async function testModule(
  module: Module,
  options: TestModuleOptions = {},
): Promise<Result<ModuleTestHarness, Failure>> {
  return testModules([module], options);
}

/**
 * Boots a test engine with multiple modules and a new session.
 *
 * @param modules - compiled modules from defineModule
 * @param options - session/meta options
 */
export async function testModules(
  modules: readonly Module[],
  options: TestModuleOptions = {},
): Promise<Result<ModuleTestHarness, Failure>> {
  const created = await createTestEngine({
    modules,
    ...(options.llm ? { llm: options.llm } : {}),
    ...(options.agentsMode ? { agentsMode: options.agentsMode } : {}),
    ...(options.moduleConfig ? { moduleConfig: options.moduleConfig } : {}),
    ...(options.persistence ? { persistence: options.persistence } : {}),
    ...(options.log ? { log: options.log } : {}),
    ...(options.strictCapabilities !== undefined
      ? { strictCapabilities: options.strictCapabilities }
      : {}),
  });
  if (!created.ok) return created;

  if (options.sessionId) {
    const loaded = await created.value.engine.loadSession(options.sessionId);
    if (!loaded.ok) return loaded;
    return createHarness(created.value, options.sessionId);
  }

  const session = await created.value.engine.startSession({
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.seed ? { seed: options.seed } : {}),
  });
  if (!session.ok) return session;

  return createHarness(created.value, session.value.sessionId);
}

/**
 * Builds the harness surface over a booted engine + live session.
 */
async function createHarness(
  value: TestEngineSuccess,
  sessionId: string,
): Promise<Result<ModuleTestHarness, Failure>> {
  const { engine, runtime } = value;
  const sliceName = value.registry.getModules()[0]?.module.manifest.stateSlices[0]?.name;

  const harness: ModuleTestHarness = {
    engine,
    runtime,
    sessionId,
    modules: value.registry.getModules().map((m) => ({
      id: m.module.manifest.id,
      version: m.module.manifest.version,
      priority: m.priority,
    })),
    async turn(text: string) {
      return engine.submitAction(sessionId, { kind: "free_text", text });
    },
    async action(action) {
      return engine.submitAction(sessionId, action);
    },
    async systemTurn(reason: string, payload?: JsonObject) {
      return runtime.submitSystemTurn(sessionId, reason, payload);
    },
    async waitIdle(timeoutMs?: number) {
      return runtime.waitIdle(sessionId, timeoutMs);
    },
    async save() {
      return engine.save(sessionId);
    },
    async load(pointer: SavePointer) {
      if (pointer.sessionId !== sessionId) {
        throw new Error(
          `harness.load: pointer belongs to session "${pointer.sessionId}", harness is on "${sessionId}" — reload the engine instead`,
        );
      }
      const loaded = await engine.loadSession(sessionId);
      if (!loaded.ok) return loaded;
      // Rebind the session id handle (same id; fresh session object).
      return ok(harness);
    },
    state() {
      return runtime.getSessionState(sessionId);
    },
    get slice() {
      if (!sliceName) return undefined;
      return runtime.getSessionState(sessionId)?.slices[sliceName];
    },
    sliceOf<T = unknown>(name: string): T | undefined {
      return runtime.getSessionState(sessionId)?.slices[name] as T | undefined;
    },
    readModel(name: string, args?: JsonObject) {
      const state = runtime.getSessionState(sessionId);
      const result = runtime.getHostSurface().getReadModel(name, state!, args);
      if (!result.ok) {
        throw new Error(
          `harness.readModel("${name}") failed: [${result.error.code}] ${result.error.message}`,
        );
      }
      return result.value;
    },
    get events() {
      return runtime.getDispatchedEvents(sessionId);
    },
    async stop() {
      await engine.stop();
    },
  };

  return ok(harness);
}