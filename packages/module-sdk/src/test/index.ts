import {
  ok,
  type Failure,
  type JsonObject,
  type LlmPort,
  type Module,
  type Result,
  type TurnResult,
} from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";

export interface TestModuleOptions {
  readonly meta?: JsonObject;
  readonly moduleConfig?: JsonObject;
  readonly llm?: LlmPort;
  readonly agentsMode?: "mock" | "llm";
  readonly seed?: string;
}

export interface ModuleTestHarness {
  readonly module: Module;
  readonly engine: Awaited<
    ReturnType<typeof createTestEngine>
  > extends { ok: true; value: infer V }
    ? V extends { engine: infer E }
      ? E
      : never
    : never;
  readonly runtime: Awaited<
    ReturnType<typeof createTestEngine>
  > extends { ok: true; value: infer V }
    ? V extends { runtime: infer R }
      ? R
      : never
    : never;
  readonly sessionId: string;
  /**
   * Submit a free_text player action.
   *
   * @param text - player text
   */
  turn(text: string): Promise<TurnResult>;
  /** Current slice value for the module (by first state slice name). */
  slice: unknown;
}

/**
 * Boots a test engine with a single module and a new session.
 *
 * @param module - compiled module from defineModule
 * @param options - session/meta options
 */
export async function testModule(
  module: Module,
  options: TestModuleOptions = {},
): Promise<Result<ModuleTestHarness, Failure>> {
  const created = await createTestEngine({
    modules: [module],
    ...(options.llm ? { llm: options.llm } : {}),
    ...(options.agentsMode ? { agentsMode: options.agentsMode } : {}),
    ...(options.moduleConfig
      ? { config: { moduleConfig: options.moduleConfig } }
      : {}),
  });
  if (!created.ok) return created;

  const session = await created.value.engine.startSession({
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.seed ? { seed: options.seed } : {}),
  });
  if (!session.ok) return session;

  const sessionId = session.value.sessionId;
  const sliceName = module.manifest.stateSlices[0]?.name;

  const harness: ModuleTestHarness = {
    module,
    engine: created.value.engine,
    runtime: created.value.runtime,
    sessionId,
    async turn(text: string) {
      return session.value.submitAction({ kind: "free_text", text });
    },
    get slice() {
      if (!sliceName) return undefined;
      const state = created.value.runtime.getSessionState(sessionId);
      return state?.slices[sliceName];
    },
  };

  return ok(harness);
}
