# Principles & Hard Rules

> **Статус:** normative

## 1. Design principles

### P1. Core is boring and stable

Core делает только то, без чего нельзя собрать ход:

- lifecycle сессии;
- registry модулей и проверка контрактов;
- turn pipeline;
- authoritative state + atomic commit;
- agent orchestration (вызов, лимиты, schema validation);
- persistence ports;
- observe-only events.

Всё остальное — modules.

### P2. Contracts over conventions

Межпакетное runtime-взаимодействие — **только** через `contracts`.

- Никаких «просто импортни private из core».
- Никаких magically named files без манифеста.
- Breaking change контракта = major semver + ADR.
- **Авторы модулей** расширяют gameplay через **`@rpengineext/module-sdk` / `defineModule`** (moments/capabilities), не через ports/pipeline. См. [ADR 0004](../adr/0004-module-sdk-cbmd.md), [../modules/README.md](../modules/README.md).
- **Maintainers core** — extension surface (registrations + interceptors + ports). См. [12-extension-surface.md](./12-extension-surface.md) (не author API).

### P3. Single source of truth

| Данные | Source of truth |
|--------|-----------------|
| Факты мира, инвентарь, отношения, время, флаги | `WorldState` через `StateCommand` |
| Утверждённый канон кампании | `CanonFact` store (core/module-owned slices via commands) |
| Текст для игрока | `Passage` (проекция после commit) |
| Память для промптов | `MemoryItem` (сжатие, **не** истина) |
| Черновики LLM | `Proposal` (эфемерны до accept) |

### P4. AI is non-authoritative

LLM может:

- предлагать действия NPC;
- писать prose;
- предлагать structured state deltas.

LLM не может:

- считаться совершившей изменение до commit;
- обходить guards;
- вводить факты, не попавшие в accepted commands / brief.

### P5. Atomic turns

Один `TurnId` = одна транзакция над world state.

См. [04-state-and-commands.md](./04-state-and-commands.md).

### P6. Explicit permissions

Модуль получает ровно те права, что объявил в манифесте. Default-deny.

### P7. Deterministic core, non-deterministic edges

- Применение команд, порядок стадий, conflict resolution — **детерминированы**.
- LLM-вызовы — нет; поэтому их выходы всегда schema-validate + нормализуются до команд.
- Replay state строится из journal команд/событий, а не из повторного «доверься LLM».

### P8. Composition over inheritance

Модули расширяют pipeline точками расширения, а не subclass core.

### P9. Fail fast at the boundary

Ошибки манифеста, missing capability, invalid schema agent output, illegal command — фиксируются явно на границе стадии. Тихий partial success запрещён внутри turn commit.

### P10. Testability by construction

Каждый публичный порт core/module должен быть заменим test double. Pipeline прогоняется с mock agents.

---

## 2. SOLID mapping

| SOLID | Как соблюдаем |
|-------|----------------|
| S | Module = одна доменная capability-area; core subsystem = одна тех. обязанность |
| O | Новое поведение = новый module/extension registration, не правка switch в core |
| L | Реализации портов взаимозаменяемы по контракту |
| I | Узкие extension interfaces вместо God-Module hooks |
| D | Core зависит от abstractions в `contracts`; host injects adapters |

---

## 3. DRY / KISS / YAGNI

- Повторяющиеся schema/result/error — только `contracts` (отдельного `shared` пакета нет).
- Не строить universal workflow engine. Нужен **фиксированный turn pipeline** + modules.
- Не добавлять extension point «на всякий случай». Новый point = ADR.

---

## 4. Hard bans (строгий бан)

1. ❌ Мутация `WorldState` в обход `StateCommand` + kernel apply.
2. ❌ Partial commit «применили что смогли» внутри одного turn.
3. ❌ Module → прямой вызов LLM provider в обход `AgentOrchestrator` (теряются budget/policy/audit).
4. ❌ Секреты, URL, model names, timeouts в коде модулей/core (только config/env).
5. ❌ `eval`, dynamic code load без манифеста и policy host’а.
6. ❌ Shared mutable globals / service locators вместо DI.
7. ❌ Смешение слоёв в одном файле (manifest + http + sql + prompt spaghetti).
8. ❌ Narrative text как источник фактов для следующего хода без materialize в state/memory policy.
9. ❌ Логирование секретов и полного system prompt с ключами.
10. ❌ Breaking change `contracts` без major version и миграционного примечания.
11. ❌ Мутация world state из `turn.committed` / observe-only moments (только `scheduleSystem` + отдельный system turn).
12. ❌ Silent discard author mistakes (`ctx.op` в forbidden moment, unknown `readModel`) — fail loud + stable code.
13. ❌ Runtime dependency `module-*` → `module-*` (только provides/requires / access / readModel).

---

## 5. Error, logging & turn tracing principles

- Внешние границы (FS, DB, LLM, module init): явный `Result` / typed error.
- Игрок видит friendly message; детали — в structured logs **и** turn `.md` trace.
- Уровни логов: `debug | info | warn | error`.
- Каждый turn (commit **или** reject) финализирует markdown-dossier: input, stages, commands, state diff, agent I/O, tool calls, outcome.
- Traces принадлежат **core** (см. [13-turn-tracing.md](./13-turn-tracing.md)); modules only annotate.
- Секреты в traces/logs не пишутся; prompts включаются конфигом.

---

## 6. Versioning policy

| Компонент | Policy |
|-----------|--------|
| `contracts` | semver; core и modules зависят от major |
| `core` | semver; host зависит от core |
| `module` | собственный semver + `engines.core` / `engines.contracts` range в манифесте |
| save format | version field + migrations |

Compat rule:

```text
module.manifest.engines.contracts satisfies loaded contracts version
module.manifest.engines.core satisfies loaded core version
```

Иначе module не загружается.

### Post-release core-change rule (Module Platform 1.0)

После tag 1.0 core меняется **только** по одному из триггеров
(spec 07 §11.3, §11.7):

1. bugfix;
2. ADR;
3. письменное доказательство, что изменение невыразимо в SDK
   ([specs/07](../specs/07-release-and-versioning.md)).

Каждый продукт-модуль — отдельная задача с harness-тестами; drive-by
правок core нет. Аддитивный optional API SDK = **minor** (`test:compat` +
`test:modules-stress` + `test:module-boundaries` зелёные); author-breaking =
**major** + миграционный гайд + CHANGELOG. sdk↔ports adapter —
**load-bearing**: никаких «быстрых» bind bypass без compat-фикстур.
Событие / опциональный хук = minor; смена dispatch
semantics / moment permissions / hook ctx rules = major.

---

## 7. Definition of “minimal core change”

Core change допустим только если выполняется хотя бы одно:

1. Новый **универсальный** extension point нужен ≥2 независимым модулям и не выражается через существующие.
2. Исправляется дефект atomicity/security/determinism.
3. Меняется persistence/runtime host contract без доменной логики.
4. Performance bottleneck в kernel/pipeline, подтверждённый замером.

Иначе — module или agent adapter.
