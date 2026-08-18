# rpengineext

Движок пошаговой ролевой игры в формате интерактивной книги (**free-text** действия игрока).

- **Core** — стабильное ядро: атомарные ходы, state, pipeline, оркестрация агентов.
- **Modules** — независимые расширения (working-memory, character, world-canon, …).
- **Agents** — LLM пишет историю и предлагает поведение NPC; **не** владеет истиной мира.

> Истина мира принадлежит core. AI предлагает. Commit атомарный.


<<<<<<< Updated upstream
## Документация
=======
Сейчас: **Phase 4 complete** — extension surface, permissions, hosts (CLI + API + Web),
persistence, turn traces, first-party modules.  
Далее: Phase 5+ — product modules по отдельным задачам; CLI UX polish; optional safety hooks.  
Core меняется только через ADR.

## Документация (источник истины)
>>>>>>> Stashed changes

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
| [docs/architecture/10-roadmap.md](./docs/architecture/10-roadmap.md) | Фазы внедрения |
| [docs/architecture/11-repository-structure.md](./docs/architecture/11-repository-structure.md) | Структура репо |
| [docs/architecture/12-extension-surface.md](./docs/architecture/12-extension-surface.md) | Поверхность расширений для модулей |
| [docs/architecture/13-turn-tracing.md](./docs/architecture/13-turn-tracing.md) | Markdown-трейсы хода (core debug/AI control) |
| [docs/modules/README.md](./docs/modules/README.md) | Гайд автора модуля |
| [docs/adr/0001-contracted-pipeline.md](./docs/adr/0001-contracted-pipeline.md) | ADR: выбор CPA |
| [docs/adr/0002-web-host-and-streaming.md](./docs/adr/0002-web-host-and-streaming.md) | ADR: API + Web + SSE |
| [docs/adr/0003-tool-calling-and-background-system-turns.md](./docs/adr/0003-tool-calling-and-background-system-turns.md) | ADR: tools + background system turns |

## Архитектура в одном абзаце

Host принимает действие игрока → **TurnPipeline** на **draft** нормализует ввод, модули валидируют/планируют, LLM/modules предлагают `StateCommand`s → dry-apply → narrative по draft-brief → сборка `Passage` → **один COMMIT** (state + passage + journal в `bun:sqlite`) **или полный откат** при любой ошибке. Модули — по манифесту и extension points, без правок core.

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
First-party modules: working-memory, character, world-canon. Дальнейшие domain modules — отдельными задачами.

## Dev-окружение

```bash
bun install
bun test
bun run cli:hello --mock
bun run cli:hello --mock --fixture
bun run cli:book --mock
```

Web UI (два терминала, localhost):

```bash
bun run api:mock          # http://127.0.0.1:8787
bun run web               # http://127.0.0.1:5173 (проксирует /v1 → API)
```

Живая LLM (после копирования `.env.example` → `.env`):

```bash
cp .env.example .env
# задать RP_LLM_API_KEY, RP_LLM_BASE_URL, RP_LLM_MODEL
bun run cli:hello
bun run cli:book
bun run api
bun run web
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
| [`@rpengineext/host-bootstrap`](./packages/host-bootstrap) | ready | общая wiring движка для CLI/API |
| [`@rpengineext/content-stories`](./packages/content-stories) | ready | каталог шаблонов историй (`data/stories`) |
| [`@rpengineext/module-working-memory`](./packages/modules/working-memory) | ready | последние N пар чата для narrative + полный архив пар в session state |
| [`@rpengineext/module-character`](./packages/modules/character) | ready | PC seed, narrative injection, background outfit tool-agent |
| [`@rpengineext/module-world-canon`](./packages/modules/world-canon) | ready | immutable world canon → narrative system prompt |
| further product modules (npc/plot/…) | planned | Phase 5+ отдельными задачами |

<<<<<<< Updated upstream
## Как вносить модули 

1. Читать `docs/modules/README.md`.
2. Копировать template.
3. Зависеть только от `contracts` (+ `shared`).
4. Не вызывать LLM SDK напрямую.
5. Покрыть success/reject/edge тестами.
=======
## Как вносить модули

1. Читать [`docs/modules/README.md`](./docs/modules/README.md) и [`writing-modules-for-core.md`](./docs/modules/writing-modules-for-core.md).
2. Копировать [`docs/modules/_template.md`](./docs/modules/_template.md).
3. Зависеть только от `@rpengineext/contracts` (core — только devDependency для тестов).
4. Не вызывать LLM SDK напрямую; state — только через `StateCommand`.
5. Покрыть success / reject / edge тестами через `@rpengineext/core/testing`.
>>>>>>> Stashed changes

## Licence

Private / TBD.
