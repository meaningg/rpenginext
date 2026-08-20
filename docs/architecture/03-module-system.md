# Module System

> **Статус:** normative  
> **Цель:** разные авторы пишут modules параллельно **без** изучения core.  
> **Author path:** `@rpengineext/module-sdk` (`defineModule` / CBMD) — см. [ADR 0004](../adr/0004-module-sdk-cbmd.md).  
> Этот документ описывает **runtime**-контракт после compile. Авторам модулей: [../modules/README.md](../modules/README.md) · [../modules/sdk-reference.md](../modules/sdk-reference.md).

## 1. Что такое module

**Module (author)** — `defineModule({ identity + capabilities })` из `@rpengineext/module-sdk`.

**Module (runtime)** — скомпилированный объект для core:

1. Манифест (identity, engines, provides/requires, permissions, priority) — **выводится sdk**.
2. Contribution’ы в fixed extension points — **биндит sdk**, не автор.
3. Namespaced state slice + named ops → commands.
4. Optional agent tasks / tools.
5. Не управляет lifecycle сессии и не commit’ит state сам.

Игрок modules не видит напрямую — только их эффект в правилах мира и качестве истории.

## 2. First-party vs future modules

### Shipped in this monorepo (wired by `host-bootstrap`)

| Module id | Package | Назначение |
|-----------|---------|------------|
| `working_memory` | `@rpengineext/module-working-memory` | last-N chat pairs + archive slice |
| `character` | `@rpengineext/module-character` | PC seed, narrative injection, background outfit sync |
| `world_canon` | `@rpengineext/module-world-canon` | immutable story canon → narrative system prompt |

### Future examples (not implemented until separate task)

| Module id (example) | Назначение |
|---------------------|------------|
| `npc` | сущности NPC, отношения, инициативы реплик/поведения |
| `plot-controller` | акты, beats, gates, fail-forward |
| `fandom-canon` | RAG/поиск канона, proposal канон-фактов кампании |
| `summarizer` | сжатие истории в memory items |

Любой module (ваш или third-party) подключается одинаково: **`defineModule` → compiled Module** + host wiring (profile / `extraModules`). Runtime boundary types live in `contracts`; author API is **module-sdk** only.

## 3. Manifest (нормативная структура)

Логический schema (имена полей стабильны). **Авторы не пишут манифест вручную** — его выводит `defineModule` / module-sdk.

`engines.core` / `engines.contracts`: ranges stamped by the **sdk** in use.

| Era | Typical engines ranges |
|-----|------------------------|
| Current monorepo **0.x** | `^0.1.0` (see `MODULE_SDK_VERSION` / package versions) |
| After **Module Platform 1.0** tag | `^1.0.0` (spec 01 / 07) |

Example shape (illustrative module id; versions follow era above):

```json
{
  "id": "npc",
  "version": "0.1.0",
  "displayName": "NPC System",
  "description": "NPC entities, relations, turn intents",
  "engines": {
    "core": "^0.1.0",
    "contracts": "^0.1.0"
  },
  "priority": 40,
  "provides": ["capability:npc", "agent-task:npc.voice"],
  "requires": ["capability:state-core"],
  "permissions": [
    "state:read",
    "state:propose:npc",
    "agent:call:npc.voice",
    "memory:read"
  ],
  "stateSlices": [
    {
      "name": "npc",
      "schemaVersion": 1
    }
  ],
  "contributes": [
    "Guard",
    "TransitionContributor",
    "NarrativeContextProvider",
    "AfterCommitHook"
  ]
}
```

Note: runtime field name is **`contributes`** (typed ports the compiled module installs). Authors still never register ports directly.

### Правила манифеста

- `id` — kebab-case / reverse-domain, уникален в process.
- `priority` — число; **меньший** = раньше в детерминированном порядке (tie-break: `id` asc).
- `provides`/`requires` — строки из registry vocabulary + module-defined capabilities.
- `permissions` — subset known permission tokens; default-deny.
- Незаявленный extension point implementation игнорируется или fail on strict mode (config).

## 4. Module lifecycle

```text
discover → load manifest → import factory → register(ctx)
  → validate graph → start(ctx) → (turns...) → stop(ctx)
```

| Phase | Module may | Module must not |
|-------|------------|-----------------|
| `register` | объявить handlers, schemas, task specs | трогать session state |
| `start` | warm caches, open own read-only resources | commit world commands |
| turn hooks | read view, propose, request agents per rules | partial external side effects that can’t roll back without compensation policy |
| `stop` | close resources | assume further turns |

## 5. Extension surface (wide freeze v1)

Короткий список из 8–9 хуков **недостаточен**: под каждый модуль снова лезли бы в core.

Поэтому v1 использует **три слоя** (полный норматив — отдельный документ):

**→ [12-extension-surface.md](./12-extension-surface.md)**

| Слой | Суть |
|------|------|
| **A. Catalog registrations** | `registerSlice/Command/AgentTask/Tool/ActionType/ReadModel/...` — новые данные и операции без core |
| **B. Stage interceptors** | `before/after/onError` на **каждой** стадии pipeline + session lifecycle |
| **C. Typed contribution ports** | расширенный набор розеток (Guard, Planner, Narrative*, Status*, …) с merge-политиками |

### Принцип стабильности core

```text
Новый gameplay  → registration + ports/interceptors в module
Новый механизм  → ADR + core (редко)
```

Product modules (npc/plot/canon/…) — **примеры**; не реализуются, пока нет отдельной задачи.

### Handler contract shape (logical)

Каждый handler/interceptor:

- не трогает authoritative state напрямую;
- получает typed input + `TurnContext`;
- возвращает typed output или `Result`;
- ограничен timeout/budget;
- пишет extras/brief только в свой namespace.

## 6. Permissions vocabulary (v1)

| Token | Meaning |
|-------|---------|
| `state:read` | читать world state view |
| `state:propose:<slice>` | предлагать commands в slice |
| `state:propose:*` | только privileged first-party, review required |
| `canon:read` | читать canon facts |
| `canon:propose` | предлагать canon upsert commands |
| `memory:read` | читать memory items |
| `memory:write` | предлагать memory write commands (в draft до COMMIT или system turn) |
| `agent:call:<taskType>` | запрашивать task type |
| `agent:call:*` | privileged |
| `rng:use` | использовать seeded rng |

Registry отвергает module, если handler пытается сделать действие без permission.

## 7. Capability graph

При boot:

1. Собрать все `provides`.
2. Убедиться, что каждый `requires` удовлетворён.
3. Обнаружить cycles в hard dependency (forbid).
4. Построить order по priority + id.

Если missing capability:

- fail boot **или** disable module + fail only if required by host profile (config policy).

Для production RP profile: missing required gameplay capability = fail boot.

## 8. Inter-module communication

Разрешено:

- через state commands + shared read models;
- через capability interfaces, published in contracts or agreed capability id;
- через plan artifacts в `TurnContext.extras` с namespaced keys (`npc.*`, `plot.*`).

Запрещено:

- direct import another module package internals;
- hidden event coupling for truth;
- order-sensitive race without deterministic priority rules.

## 9. Packaging rules for independent authors

Минимальный skeleton:

```text
modules/<id>/
  package.json          # dep: @rpengineext/module-sdk
  README.md
  src/
    index.ts            # export createXxxModule() => defineModule(...)
    schema.ts           # zod slice/ops (optional split)
  tests/
    module.test.ts
```

Автор модуля обязан:

1. Зависеть от `@rpengineext/module-sdk` (не от core internals; core — только для тестов через sdk/test).
2. Покрыть ≥3 tests (success, reject, edge).
3. Не обещать side effects вне atomic turn model.
4. Не вызывать LLM SDK напрямую.

Гайд автора (пошагово + рецепты): [../modules/README.md](../modules/README.md).  
Scaffold: `bun run create-module <id>`.  
Шаблон: [../modules/_template.md](../modules/_template.md).

## 10. Official vs community modules

| | Official | Community |
|--|----------|-----------|
| path | `packages/modules/*` | external packages / `modules/` drop-in |
| review | core maintainers | host integrator |
| permissions | may request broader, still reviewed | prefer least privilege |
| stability | versioned with repo | own semver |

Host whitelist modules by id/version in config.

## 11. How core stays unchanged when modules grow

Если автору нужна «ещё одна возможность»:

1. Сначала выразить через existing extension point + commands.
2. Если не хватает **данных** — namespaced slice + commands.
3. Если не хватает **стадии** — ADR на новый extension point (rare).
4. Если не хватает **инфраструктуры LLM** — новый `taskType` + agent adapter, не core domain code.

Это и есть механизм «core минимально меняется».
