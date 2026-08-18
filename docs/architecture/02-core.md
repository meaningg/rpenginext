# Core

> **Статус:** normative  
> **Цель core:** быть маленьким, жёстким и редким в изменениях.

## 1. Mission

Core собирает систему в единый runtime:

- загружает и проверяет modules;
- ведёт session/turn loop;
- хранит и атомарно меняет authoritative state;
- вызывает agents по единым правилам;
- пишет подробные **turn trace `.md`** для дебага/контроля AI;
- отдаёт host’у результат хода для игрока.

Core **не** содержит:

- конкретной NPC-логики;
- fandom lore;
- plot DSL конкретного сеттинга;
- UI;
- vendor lock на одного LLM-провайдера (только port).

## 2. Subsystems

```text
core/
  create-engine.ts     # composition entry for hosts/tests
  registry/            # ModuleRegistry, CapabilityGraph
  session/             # SessionRuntime
  pipeline/            # TurnPipeline + stages
  state/               # StateKernel, command catalog application
  agents/              # AgentOrchestrator
  tracing/             # TurnTracer + markdown renderer (normative)
  events/              # EventBus (observe-only)
  persistence/         # InMemoryPersistence; port impl otherwise outside
  host/                # HostSurface aggregation
  config/              # typed config boundaries
  testing/             # @rpengineext/core/testing
  util/
```

### 2.1 ModuleRegistry

**Входы:** module factories + manifests, contracts version, core version.  
**Выходы:** loaded module instances, capability graph, init errors.

Обязанности:

- validate manifest schema;
- check `engines.core` / `engines.contracts`;
- resolve `provides` / `requires`;
- enforce permission declarations;
- deterministic module order (explicit priority, then module id);
- lifecycle: `register → validateGraph → start → stop`.

### 2.2 SessionRuntime

**Входы:** `NewSessionSpec` или loaded snapshot.  
**Выходы:** `Session` handle API for host.

API-уровень (логический):

- `startSession(spec) → Session`
- `loadSession(id) → Session`
- `submitAction(sessionId, action) → TurnResult`
- `getPassage(sessionId) → Passage`
- `save(sessionId) → SavePointer`
- `stopSession(sessionId)`

SessionRuntime **не** парсит fandom и не пишет прозу — только координирует.

### 2.3 TurnPipeline

Фиксированная последовательность стадий. Модули подключаются к stage slots, но не переопределяют каркас произвольно.

См. [06-turn-pipeline.md](./06-turn-pipeline.md).

### 2.4 StateKernel

- держит текущий `WorldState`;
- принимает список `StateCommand` кандидата;
- валидирует каждую команду (schema + domain validators + module guards already passed stage);
- apply в transaction buffer;
- `commit` или `rollback`;
- пишет journal entries.

См. [04-state-and-commands.md](./04-state-and-commands.md).

### 2.5 AgentOrchestrator

- принимает `AgentTask` от pipeline/modules;
- применяет budget/timeout/concurrency policy;
- выбирает adapter по `task.type` / routing config;
- schema-validate response;
- optional repair retry;
- возвращает `AgentResult` или typed failure;
- audit log task meta (без секретов).

См. [05-agents.md](./05-agents.md).

### 2.6 TurnTracer (markdown dossiers)

Core-owned collector/renderer for per-turn `.md` traces:

- state diffs & commands;
- agent inputs/outputs, repairs, usage;
- tool calls + results;
- stage timeline, guards, narrative brief/passage;
- written on both commit and rollback outcomes.

Normative detail: [13-turn-tracing.md](./13-turn-tracing.md).

### 2.7 EventBus

Publish-only для observability и host projections:

- `turn.started` / `turn.committed` / `turn.rejected`
- `module.loaded` / `agent.task.finished`
- `state.committed`
- `trace.finalized` / `trace.write_failed`

**Запрет:** подписчик event bus не может мутировать world state.

### 2.8 Persistence boundary

Core знает только `PersistencePort`:

- save snapshot + journal chunk;
- load;
- list sessions (optional).

Реализации — вне core package.

## 3. Dependency direction

```text
apps → host-bootstrap / core → contracts
modules → contracts
modules ↛ core internals (core only as test devDependency)
core → contracts, logger
agents adapters → contracts
persistence impl → contracts
```

`modules` зависят от `contracts`; boundary utilities (`Result`, ids) — в contracts, не в отдельном `shared`.

## 4. Core public surface

Публично для host:

- bootstrap/factory `createEngine(options)`
- `Engine` / `Session` interfaces из contracts
- config types

Публично для modules (через contracts, не deep imports):

- extension point interfaces
- command types they are permitted to propose
- read models / selectors
- task specs
- logger/context scoped handles

## 5. Context objects

Каждый turn имеет `TurnContext` (read-oriented + limited proposers):

| Поле | Описание |
|------|----------|
| `turnId` | уникальный id хода |
| `sessionId` | сессия |
| `stateView` | readonly projection world state |
| `rng` | optional seeded rng for deterministic mechanics modules |
| `permissions` | effective module permission checker |
| `propose(commands)` | buffer commands into turn draft (not committed) |
| `requestAgent(task)` | enqueue/execute per stage policy |
| `log` | structured logger bound to turn |
| `trace` | `note()` API for namespaced module annotations in turn `.md` |
| `extras` | namespaced bag for stage-local data (не persistence truth) |

После commit `TurnContext` закрывается.

## 6. Minimal built-in capabilities

Core может ship’ить только technical built-ins:

- noop/health module loader checks;
- default narrative task type wiring (adapter selection), **без** сюжетной логики;
- base command types: core meta (turn counter, timestamps, passage cursor).

Domain built-ins (NPC, inventory ruleset, combat) — modules, даже если «официальные first-party».

## 7. Stability checklist before changing core

- [ ] Есть ADR
- [ ] Нельзя выразить модулем
- [ ] Контракты версионированы
- [ ] Pipeline atomicity не ослаблена
- [ ] Golden turn tests обновлены
- [ ] Module author docs обновлены
