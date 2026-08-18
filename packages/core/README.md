# `@rpengineext/core`

Stable engine runtime for rpengineext.

## Responsibilities

- `ModuleRegistry` + capability graph + full extension surface (catalogs / interceptors / typed ports)
- `strictManifest` / permissions / capability filtering at boot
- `moduleConfig` validated against `registerConfigSchema` at boot
- `StateKernel` — draft dry-apply, single commit / discard
- `TurnPipeline` — fixed stages 0–11, **full-atomic** turns, stage timeouts
- Module-scoped `TurnContext.permissions` on every contribution call
- Agent task queue drained on **plan / propose / narrate** (contributors + interceptor enqueue)
- `SessionRuntime` / `createEngine` — host facade, system-turn drain, journal replay, slice migrations
- `AgentOrchestrator` — mock/`LlmPort`, parallel tasks, tools, repair hints wired
- `HostSurface` — help / debug / CLI / save meta / read models / memory-kind validate
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

## Stability note

Core Phase 4 finalize is intended to be **rarely changed**. Prefer modules +
contracts extension surface. Touch core only for mechanism gaps (new pipeline
semantics, atomicity, security boundary) with an ADR.

## Normative docs

- `docs/architecture/02-core.md`
- `docs/architecture/04-state-and-commands.md`
- `docs/architecture/06-turn-pipeline.md`
- `docs/architecture/12-extension-surface.md`
- `docs/architecture/13-turn-tracing.md`

## Module authors

- `docs/modules/README.md` — start here
- `docs/modules/sdk-reference.md` — full SDK catalog (capabilities, ctx, lifecycle)
- `docs/modules/recipes.md` / `schemas.md` — patterns and Zod
- `docs/modules/_template.md` — copy-paste skeleton
