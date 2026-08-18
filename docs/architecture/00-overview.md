# RP Engine Ext — Architecture Overview

> **Статус:** normative (обязательно к соблюдению)  
> **Версия документа:** 0.1.0  
> **Стек v1:** Bun + TypeScript (ESM)

## 1. Что это

**RP Engine Ext** — движок пошаговой ролевой игры в формате интерактивной книги.

Для игрока:

- ход → реакция мира → художественный текст → новые возможности действовать;
- LLM пишет историю и «ведёт» NPC;
- мир остаётся последовательным между ходами.

Для разработчиков:

- **core** — стабильное ядро, меняется редко и только через ADR;
- **modules** — независимые расширения, которые разные люди пишут по одним контрактам;
- **agents** — LLM-исполнители задач, **не** владельцы истины о мире.

## 2. Главный инвариант

```text
AI предлагает. Модули помогают и ограничивают. Core проверяет и атомарно фиксирует.
```

| Роль | Может | Не может |
|------|--------|----------|
| Core | владеть state, валидировать, commit/rollback хода, оркестрировать pipeline | знать бизнес-детали NPC/фандома/сюжета |
| Module | читать разрешённый state, предлагать команды, давать guards/context, описывать agent tasks | писать в world state в обход command bus; обходить pipeline |
| Agent (LLM) | возвращать structured proposal и prose по brief | мутировать state; быть source of truth |
| Player | отправлять free-text action | напрямую менять facts мира |

## 3. Игровой UX (целевой)

Модель ощущений: **turn-based RP book**.

1. Игрок видит **Passage** (страницу): нарратив + статусные подсказки (опционально).
2. Игрок вводит **free-text Action**.
3. Движок выполняет **один атомарный Turn**.
4. Игрок получает новый Passage.

Внутри хода могут работать несколько модулей и агентов, но снаружи это **один шаг** с одним результатом: успех или отказ без частичных побочных эффектов.

## 4. Архитектурный стиль

**Contracted Pipeline Architecture (CPA)** = Ports & Capabilities + Authoritative Turn Pipeline.

- Модульность через **явные контракты** (`packages/contracts`).
- Истина мира через **команды состояния** и **атомарный commit**.
- События — только для наблюдений (логи, UI, метрики), не для мутации truth.
- Core стабилен, потому что вся вариативность уходит в modules + agents за fixed extension points.

Подробности:

| Документ | Тема |
|----------|------|
| [01-principles.md](./01-principles.md) | Принципы и жёсткие запреты |
| [02-core.md](./02-core.md) | Границы core, подсистемы |
| [03-module-system.md](./03-module-system.md) | Модули, манифест, permissions |
| [04-state-and-commands.md](./04-state-and-commands.md) | State, команды, атомарность |
| [05-agents.md](./05-agents.md) | LLM / multi-agent |
| [06-turn-pipeline.md](./06-turn-pipeline.md) | Стадии хода |
| [07-persistence.md](./07-persistence.md) | Save/load, replay |
| [08-configuration.md](./08-configuration.md) | Конфиг и секреты |
| [09-testing.md](./09-testing.md) | Тестовая стратегия |
| [10-roadmap.md](./10-roadmap.md) | Фазы внедрения |
| [11-repository-structure.md](./11-repository-structure.md) | Дерево репозитория |
| [12-extension-surface.md](./12-extension-surface.md) | Широкая поверхность расширений (A/B/C) |
| [13-turn-tracing.md](./13-turn-tracing.md) | Core: markdown-трейсы хода для дебага/AI control |
| [../modules/writing-modules-for-core.md](../modules/writing-modules-for-core.md) | **Как писать модули** (практика) |
| [../modules/README.md](../modules/README.md) | Index docs автора модуля |
| [../adr/0001-contracted-pipeline.md](../adr/0001-contracted-pipeline.md) | ADR выбора архитектуры |
| [../adr/0002-web-host-and-streaming.md](../adr/0002-web-host-and-streaming.md) | ADR: API + Web + SSE |
| [../adr/0003-tool-calling-and-background-system-turns.md](../adr/0003-tool-calling-and-background-system-turns.md) | ADR: tools + background turns |

## 5. Высокоуровневая схема

```text
┌─────────────────────────────────────────────────────────────────┐
│ app host (CLI / API / Web UI)                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ PlayerAction
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ CORE (stable)                                                   │
│  SessionRuntime → TurnPipeline → StateKernel (atomic commit)    │
│  ModuleRegistry → CapabilityGraph                               │
│  AgentOrchestrator → (budget, schema, retries)                  │
│  EventBus (observe-only) · PersistencePort                      │
└───────────────┬─────────────────────────┬───────────────────────┘
                │ extension points        │ AgentTask
                ▼                         ▼
        ┌───────────────┐         ┌────────────────┐
        │ MODULES       │         │ AGENTS (LLM)   │
        │ npc, plot,    │         │ narrative,     │
        │ canon, summary│         │ npc-voice, ... │
        └───────────────┘         └────────────────┘
```

## 6. Пакеты (логические)

| Пакет | Меняется | Назначение |
|-------|----------|------------|
| `contracts` | редко, semver | публичные типы, порты, schemas, extension points, Result/ids |
| `core` | редко | runtime, pipeline, registry, state kernel, orchestrator, tracing |
| `logger` | умеренно | structured logging |
| `host-bootstrap` | умеренно | composition root CLI/API |
| `content-stories` | умеренно | loader каталога story JSON |
| `modules/*` | часто | независимые авторы (+ first-party) |
| `agents/*` | умеренно | провайдеры LLM и специализированные agent adapters |
| `persistence/sqlite` | умеренно | bun:sqlite за PersistencePort |
| `apps/*` | часто | CLI / API / Web |

Отдельного пакета `shared` **нет** — boundary primitives живут в `contracts`.

**Правило стабильности core:** если фичу можно сделать модулем — она не идёт в core.

## 7. Атомарность хода (кратко)

Turn = **full-atomic** транзакция:

- до единого `COMMIT` всё живёт в draft (state + passage);
- успех = публикация state + passage + journal (+ sqlite flush) **вместе**;
- **любая** фатальная ошибка (guard, LLM, validate, present, db) = discard draft, мир как на входе хода.

Не бывает «NPC уже изменён, а текста/флага нет».

Детали: [04-state-and-commands.md](./04-state-and-commands.md), [06-turn-pipeline.md](./06-turn-pipeline.md).

## 7.1 Host & persistence v1

- Hosts: **CLI**, **HTTP API** (`apps/api`), **Web UI** (`apps/web`)
- Shared wiring: **`packages/host-bootstrap`**
- Story templates: **`data/stories`** + **`packages/content-stories`**
  - in git: example templates only (`demo.hello`, `demo.book`)
  - private local JSON allowed beside them (gitignored)
- Persistence: **`bun:sqlite`** (engine) + host identity db (`data/host.sqlite`)
- Turn debug traces: **core** → `.md` dossiers (prompts, tools, state diff, rollback)
- Progress: observe-only `EventBus` → API SSE (`turn.stage`, agent tasks, draft `llm.stream.delta`)
- First-party modules: working-memory, character, world-canon
- Further product modules (npc/plot/…): **не в scope**, пока нет отдельной задачи

## 8. Для кого какая «толстая» документация

| Аудитория | Читать сначала |
|-----------|----------------|
| Архитектор / maintainer core | 00 → 01 → 02 → 04 → 06 → ADR |
| Автор модуля | 01 → 03 → [writing-modules-for-core](../modules/writing-modules-for-core.md) → 12 → 04 → 09 |
| Автор agent/provider | 05 → 06 → contracts (task schemas) |
| Host/UI | 00 → 06 → 07 → 08 |

## 9. Нецели v1

- MMO / realtime combat clock;
- произвольный sandbox eval модулей без манифеста;
- доверие к LLM как к базе фактов;
- монолит «один файл на всё»;
- скрытые глобальные синглтоны вместо DI.

## 10. Критерий готовности архитектуры

Архитектура считается рабочей, если:

1. Новый модуль подключается **только** через манифест + реализацию published ports.
2. Два автора модулей не правят core ради типичной фичи.
3. Turn всегда atomic и replayable.
4. Отключение модуля не ломает boot core (только capability graph / missing requires).
5. Игрок получает устойчивый turn-based RP loop независимо от набора modules (минимальный core loop).
