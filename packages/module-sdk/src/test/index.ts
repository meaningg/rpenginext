/**
 * Author-facing module test harness (specs/02 §4).
 *
 * Entry: `@rpengineext/module-sdk/test` — the author test SoT for Platform 1.0.
 * Advanced/maintainer escape: `@rpengineext/core/testing` `createTestEngine`.
 *
 * @packageDocumentation
 */

export {
  testModule,
  testModules,
  type TestModuleOptions,
  type ModuleTestHarness,
} from "./harness.ts";
export {
  expectCommitted,
  expectRejected,
  expectSlice,
  expectEvent,
} from "./asserts.ts";
export {
  fixedProseLlm,
  scriptedToolLlm,
  type ToolScriptStep,
} from "./llm-mocks.ts";