/**
 * Test-only exports for core (not part of stable host surface beyond testing).
 */
export { createTestEngine } from "./create-test-engine.ts";
export type {
  CreateTestEngineOptions,
  TestEngineBundle,
} from "./create-test-engine.ts";
export { createFixtureHelloModule } from "./fixture-hello-module.ts";
export { MemoryTraceSink } from "../tracing/memory-trace-sink.ts";
export { FilesystemTraceSink } from "../tracing/filesystem-trace-sink.ts";
export { InMemoryPersistence } from "../persistence/in-memory-persistence.ts";
export { MockAgentScript, createDefaultMockAgentScript } from "../agents/mock-agent-script.ts";
export { normalizeTraceMarkdown } from "../tracing/markdown-renderer.ts";
