# rpengineext

Движок пошаговой ролевой игры в формате интерактивной книги (**free-text** действия игрока).

- **Core** — стабильное ядро: атомарные ходы, state, pipeline, оркестрация агентов.
- **Modules** — независимые расширения (working-memory, character, world-canon, …).
- **Agents** — LLM пишет историю и предлагает поведение NPC; **не** владеет истиной мира.

> **Module Platform 1.0 shipped** (production): SDK frozen `1.0.0`, harness + stress, host composition, migrations, readModel, events, lifecycle.
> Release notes: [`docs/releases/module-platform-1.0.md`](./docs/releases/module-platform-1.0.md) · Specs: [`docs/specs/README.md`](./docs/specs/README.md) · Compatibility: [`docs/modules/compatibility.md`](./docs/modules/compatibility.md)

> Истина мира принадлежит core. AI предлагает. Commit атомарный.

## Release verification (Module Platform 1.0)

Все 8 команд обязательны зелёными перед любым production-релизом
([spec 07 §5](./docs/specs/07-release-and-versioning.md)):

```bash
bun run typecheck
bun run test:compat
bun run test:modules-stress
bun run test:module-boundaries
bun run test:scaffold-smoke
bun run test:platform
bun run test:e2e
bun run smoke:play:mock
```

## Документация (источник истины)

Начните здесь:

| Документ | Описание |
|----------|----------|
| [docs/architecture/00-overview.md](./docs/architecture/00-overview.md) | Обзор системы |
| [docs/architecture/01-principles.md](./docs/architecture/01-principles.md) | Принципы и запреты |
| [docs/architecture/02-core.md](./docs/architecture/02-core.md) | Границы core |
| [docs/architecture/03-module-system.md](./docs/architecture/03-module-system.md) | Модули и манифесты |
| [docs/architecture/04-state-and-commands.md](./docs/architecture/04-state-and-commands.md) | State и атомарность хода |
| [docs/architecture/05-agents.md](./docs/architecture/05-agents.md) | LLM / multi-agent |
| [docs/architecture/06-turn-pipeline.md](./docs/architecture/06-turn-pipeline.md) | Стадии turn |
| [docs/architecture/07-persistence.md](./docs/architecture/07-persistence.md) | Save/load |
| [docs/architecture/08-configuration.md](./docs/architecture/08-configuration.md) | Конфиг |
| [docs/architecture/09-testing.md](./docs/architecture/09-testing.md) | Тесты |
| [docs/specs/README.md](./docs/specs/README.md) | **Module Platform 1.0** — specs, DoD, verification |
| [docs/architecture/11-repository-structure.md](./docs/architecture/11-repository-structure.md) | Структура репо |
| [docs/architecture/12-extension-surface.md](./docs/architecture/12-extension-surface.md) | Internal runtime ports (maintainers; не author API) |
| [docs/architecture/13-turn-tracing.md](./docs/architecture/13-turn-tracing.md) | Markdown-трейсы хода (core debug/AI control) |
| [docs/modules/README.md](./docs/modules/README.md) | **Как сделать модуль** — старт |
| [docs/modules/sdk-reference.md](./docs/modules/sdk-reference.md) | **SDK reference** — полный каталог capabilities / ctx (**Normative SDK 1.0**) |
| [docs/modules/recipes.md](./docs/modules/recipes.md) | Рецепты модулей (без Zod-шума) |
| [docs/modules/schemas.md](./docs/modules/schemas.md) | Zod-схемы state/config/AI |
| [docs/modules/compatibility.md](./docs/modules/compatibility.md) | Совместимость SDK 1.x: semver, IR, engines, gates |
| [docs/modules/errors.md](./docs/modules/errors.md) | Каталог author errors E01–E26 |
| [docs/modules/conventions.md](./docs/modules/conventions.md) | Конвенции: priority bands, readModel, events, lifecycle |
| [docs/releases/module-platform-1.0.md](./docs/releases/module-platform-1.0.md) | **Release notes** Module Platform 1.0 |
| [docs/adr/0001-contracted-pipeline.md](./docs/adr/0001-contracted-pipeline.md) | ADR: выбор CPA |
| [docs/adr/0002-web-host-and-streaming.md](./docs/adr/0002-web-host-and-streaming.md) | ADR: API + Web + SSE |
| [docs/adr/0003-tool-calling-and-background-system-turns.md](./docs/adr/0003-tool-calling-and-background-system-turns.md) | ADR: tools + background system turns |
| [docs/adr/0004-module-sdk-cbmd.md](./docs/adr/0004-module-sdk-cbmd.md) | ADR: Module SDK / CBMD author path |
| [docs/adr/0005-moments-native-core.md](./docs/adr/0005-moments-native-core.md) | ADR: moments-native core (deferred) |
| [docs/adr/0006-local-module-discovery.md](./docs/adr/0006-local-module-discovery.md) | ADR: local module discovery (zero-wiring pool, implemented, host-bootstrap) |

## Архитектура в одном абзаце

Host принимает действие игрока → **TurnPipeline** на **draft** нормализует ввод, модули валидируют/планируют, LLM/modules предлагают `StateCommand`s → dry-apply → narrative по draft-brief → сборка `Passage` → **один COMMIT** (state + passage + journal в `bun:sqlite`) **или полный откат** при любой ошибке. Модули пишутся через **`@rpengineext/module-sdk`** (`defineModule` / capabilities); core не правится под gameplay.

```text
Player Action
    → Normalize → Intent → Guard → Plan → Propose
    → Validate (draft) → Narrate → Present (+ materialize)
    → COMMIT (all) | ROLLBACK (all)
```

Working memory (всегда включена в host): env `RP_WORKING_MEMORY_WINDOW` = N **пар**,
которые подмешиваются в `narrative.write` как история чата; полный архив живёт в slice `working_memory`.

Хосты v1: **CLI** + **HTTP API** (`apps/api`) + **Web UI** (`apps/web`).  
Персистентность v1: **bun:sqlite**.  
Отладка v1: core пишет подробные **turn `.md` traces** (state diff, LLM I/O, tool calls).  
First-party modules: working-memory, character, world-canon, summary. Дальнейшие domain modules — отдельными задачами.

## Dev-окружение

```bash
bun install
bun test
bun run cli:hello --mock
bun run cli:hello --mock --fixture
bun run cli:book --mock
```

Всё разом — движок (API host) и Web UI одной командой (один терминал):

```bash
bun start                 # API http://127.0.0.1:8787 + Web http://127.0.0.1:5173 (проксирует /v1 → API)
```

Без `.env` API стартует в **mock**-режиме (скриптованный LLM). Для раздельных логов — два терминала:

```bash
bun run api:mock          # http://127.0.0.1:8787
bun run web               # http://127.0.0.1:5173 (проксирует /v1 → API)
```

Живая LLM (после копирования `.env.example` → `.env`):

```bash
cp .env.example .env
# задать RP_LLM_API_KEY, RP_LLM_BASE_URL, RP_LLM_MODEL
bun start
# или раздельно: bun run api + bun run web
bun run cli:hello
bun run cli:book
# продолжить: bun run apps/cli/src/main.ts --session <id> --repl
```

Целевой стек: монорепо **Bun + TypeScript** (`packages/*`, `packages/*/*`, `apps/*`).

### Story templates

Каталог: `data/stories` (`RP_STORIES_DIR`).  
В git лежат только **example** шаблоны (`demo.hello`, `demo.book`).  
Любые другие JSON в этой папке — локальные/приватные и **не коммитятся**.  
Подробности: [`data/stories/README.md`](./data/stories/README.md).

### Пакеты workspace

| Пакет | Статус | Роль |
|-------|--------|------|
| [`@rpengineext/logger`](./packages/logger) | ready | структурированный pino logger (pretty/JSON, child bindings, redact) |
| [`@rpengineext/contracts`](./packages/contracts) | ready | публичные ports, манифест, схемы state/turn/agent, extension surface |
| [`@rpengineext/core`](./packages/core) | ready (Phase 4) | registry, state kernel, turn pipeline, agents, turn tracer, host surface |
| [`@rpengineext/persistence-sqlite`](./packages/persistence/sqlite) | ready | bun:sqlite `PersistencePort` + атомарный `commitTurn` |
| [`@rpengineext/agents-responses`](./packages/agents/responses) | ready | Responses API `LlmPort` (`POST /v1/responses`) |
| [`@rpengineext/cli`](./apps/cli) | ready | hello turn / REPL book loop, save/load |
| [`@rpengineext/api`](./apps/api) | ready | REST + SSE host, локальные multi-player сессии |
| [`@rpengineext/web`](./apps/web) | ready | React + Tailwind book UI |
| [`@rpengineext/module-sdk`](./packages/module-sdk) | **1.0.0 frozen** | **единственный** author API модулей (`defineModule`) |
| [`@rpengineext/create-module`](./packages/create-module) | ready | scaffold: `bun run create-module <id> --recipe <…>` (8 recipes) |
| [`@rpengineext/host-bootstrap`](./packages/host-bootstrap) | ready | общая wiring движка для CLI/API |
| [`@rpengineext/content-stories`](./packages/content-stories) | ready | каталог шаблонов историй (`data/stories`) |
| [`@rpengineext/module-working-memory`](./packages/modules/working-memory) | ready | последние N пар чата для narrative + полный архив пар в session state |
| [`@rpengineext/module-summary`](./packages/modules/summary) | ready | дельта-чанки working memory через фоновые system turns → все саммари в narrative system prompt |
| [`@rpengineext/module-character`](./packages/modules/character) | ready | PC seed, narrative injection, background outfit tool-agent |
| [`@rpengineext/module-world-canon`](./packages/modules/world-canon) | ready | immutable world canon → narrative system prompt |
| further product modules (npc/plot/…) | planned | Phase 5+ отдельными задачами |

## Как сделать модуль (кратко)

**Доки модулей:** [`docs/modules/README.md`](./docs/modules/README.md) (старт) · [`sdk-reference.md`](./docs/modules/sdk-reference.md) (весь SDK) · [`recipes.md`](./docs/modules/recipes.md) · [`schemas.md`](./docs/modules/schemas.md).

```bash
# 1. каркас
bun run create-module mood
# recipes (8): state | seed-narrative | guard | full | ai-tool | access-read | migrate | events
# bun run create-module lore --recipe seed-narrative

bun install
bun test packages/modules/mood
```

```ts
// 2. суть — packages/modules/<id>/src/index.ts
import { defineModule, deny } from "@rpengineext/module-sdk";

export function createMoodModule() {
  return defineModule({
    id: "mood",
    version: "0.1.0",
    title: "Mood",
    state: { /* schema + ops */ },
    turn: { change(ctx) { ctx.op("bump", { by: 1 }); } },
    narrative: { system: ({ slice }) => `...` },
  });
}
```

3. Подключить: `extraModules` / `modules` / profiles / env (`RP_MODULES`, `RP_DISABLE_MODULES`) — [specs/04](./docs/specs/04-host-composition.md).  
4. Тесты через **`@rpengineext/module-sdk/test`**: success / reject / edge (+ `expectEvent`, `scriptedToolLlm`).  
5. Public contract в README модуля (provides/requires, slice, readModels, events).  
6. Runtime dep только **`@rpengineext/module-sdk`** + zod (не core internals, не LLM SDK, не другие `module-*`).  
7. Шаблон: [`docs/modules/_template.md`](./docs/modules/_template.md) · reference: [`sdk-reference.md`](./docs/modules/sdk-reference.md) · platform: [`docs/specs`](./docs/specs/README.md) · ADR: [0004](./docs/adr/0004-module-sdk-cbmd.md).

## Licence

Private / TBD.
