/**
 * `@rpengineext/core` — stable engine runtime.
 *
 * Hosts depend on {@link createEngine} and contracts `Engine` / `Session`.
 *
 * @packageDocumentation
 */

export { CORE_VERSION } from "./version.ts";
export { createEngine, validateModuleConfigs } from "./create-engine.ts";
export type {
  CreateEngineOptions,
  CreateEngineSuccess,
} from "./create-engine.ts";
export type { EngineConfig } from "./config/types.ts";
export { DEFAULT_ENGINE_CONFIG, mergeEngineConfig } from "./config/defaults.ts";
export { StateKernel } from "./state/state-kernel.ts";
export { ModuleRegistry } from "./registry/module-registry.ts";
export { AgentOrchestrator } from "./agents/agent-orchestrator.ts";
export {
  MockAgentScript,
  createDefaultMockAgentScript,
  createEmptyMockAgentScript,
} from "./agents/mock-agent-script.ts";
export { StandardTaskLlmAdapter } from "./agents/standard-task-llm-adapter.ts";
export { TurnTracer } from "./tracing/turn-tracer.ts";
export {
  renderTurnTraceMarkdown,
  normalizeTraceMarkdown,
} from "./tracing/markdown-renderer.ts";
export { MemoryTraceSink } from "./tracing/memory-trace-sink.ts";
export { FilesystemTraceSink } from "./tracing/filesystem-trace-sink.ts";
export { InMemoryPersistence } from "./persistence/in-memory-persistence.ts";
export { EventBus } from "./events/event-bus.ts";
export { SessionRuntime } from "./session/session-runtime.ts";
export { HostSurface } from "./host/host-surface.ts";
export type { HostHelpTopic, HostCliCommand } from "./host/host-surface.ts";
export { replayJournal } from "./state/journal-replay.ts";
export type {
  JournalReplayInput,
  JournalReplayResult,
} from "./state/journal-replay.ts";
export { applySliceMigrations } from "./state/slice-migrations.ts";
export { createSystemClock, createFixedClock } from "./util/clock.ts";
export type { Clock } from "./util/clock.ts";
export { withTimeout } from "./util/with-timeout.ts";
export {
  createCorePermissionChecker,
  createModulePermissionChecker,
  createTurnContext,
  withPermissions,
} from "./pipeline/turn-context.ts";
export {
  commandTouchesConflictKey,
  collectCommandWritePaths,
  globPathMatch,
} from "./pipeline/conflict-paths.ts";
