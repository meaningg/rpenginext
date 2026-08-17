# `@rpengineext/core`

Stable engine runtime for rpengineext.

## Responsibilities

- `ModuleRegistry` + capability graph + full extension surface (catalogs / interceptors / typed ports)
- `strictManifest` / permissions / capability filtering at boot
- `StateKernel` — draft dry-apply, single commit / discard
- `TurnPipeline` — fixed stages 0–11, **full-atomic** turns, stage timeouts
- `SessionRuntime` / `createEngine` — host facade, system-turn drain, journal replay, slice migrations
- `AgentOrchestrator` — mock scripts and/or `LlmPort`, parallel tasks, agent tools
- `HostSurface` — help / debug / CLI meta-commands / save metadata / read models
- `TurnTracer` — markdown turn dossiers via `TraceSinkPort`

## Usage

```ts
import { createEngine, createDefaultMockAgentScript, InMemoryPersistence, MemoryTraceSink } from "@rpengineext/core";
import { createLogger } from "@rpengineext/logger";

const created = await createEngine({
  deps: {
    log: createLogger({ name: "app" }),
    persistence: new InMemoryPersistence(),
    traceSink: new MemoryTraceSink(),
  },
  mockAgentScript: createDefaultMockAgentScript(),
});

if (!created.ok) throw new Error(created.error.message);

const session = await created.value.engine.startSession();
if (!session.ok) throw new Error(session.error.message);

const turn = await session.value.submitAction({
  kind: "free_text",
  text: "hello",
});
```

## Tests

```bash
bun test packages/core
```

Testing helpers: `@rpengineext/core/testing`.

## Normative docs

- `docs/architecture/02-core.md`
- `docs/architecture/04-state-and-commands.md`
- `docs/architecture/06-turn-pipeline.md`
- `docs/architecture/13-turn-tracing.md`

## Module authors

- `docs/modules/writing-modules-for-core.md` — how to write modules against this core
- `docs/modules/_template.md` — starter manifest + factory + tests
