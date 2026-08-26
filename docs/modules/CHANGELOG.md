# CHANGELOG — `@rpengineext/module-sdk` & Module Platform

Правила ведения (процесс):

- **Каждый** опубликованный author-visible change получает запись: `Added` /
  `Changed` / `Fixed` / `Breaking` секции в обратном хронологическом порядке.
- MAJOR-изменения (spec 01 §5.2): пермиссии моментов, event dispatch
  semantics, удаление/переименование API, IR break — обязательная секция
  `Breaking` + ссылка на миграционный гайд (compatibility.md).
- MINOR/PATCH: `Added` / `Fixed`; обязательные гейты — `test:compat`,
  `test:modules-stress`, `test:module-boundaries` (compatibility.md §6).
- Версии штампуются по семантике из [compatibility.md](./compatibility.md).

---

## 1.0.0 — Module Platform 1.0 (production)

> Author surface frozen: `defineModule` + capability kinds
> `state | seed | rules | turn | narrative | ai | host | config | access | events`.
> Нормативные документы: [sdk-reference](./sdk-reference.md) (header Normative),
> [compatibility.md](./compatibility.md), [errors.md](./errors.md),
> [conventions.md](./conventions.md).

### Added

- **`events` capability kind** (spec 06 §7): `events.emit` / `events.subscribe`
  declarations + `ctx.emit(name, payload?)`; dispatch только в
  `turn.committed` / `turn.rejected` / `event.dispatch`; подписчики
  observe-only; caps `MODULE_EVENT_MAX_CASCADE_DEPTH = 8`,
  `MODULE_EVENT_MAX_BURST_PER_TURN = 256` (contracts).
- **Lifecycle hooks** (spec 06 §8): optional `init(ctx)` / `shutdown()`;
  init — после boot-валидации, без world-доступа (fail-loud); shutdown —
  reverse priority, cleanup only.
- **`ctx.readModel(name, args?)`** (spec 06 §6): стабильный cross-module
  query; unknown name → `MODULE_READ_MODEL_UNKNOWN` во всех моментах
  (без silent `undefined`); args schema → `MODULE_READ_MODEL_ARGS_INVALID`.
- **Harness `@rpengineext/module-sdk/test`** (spec 02): `testModule` /
  `testModules`, `turn` / `action` / `systemTurn` / `waitIdle`,
  `save` / `load`, `slice` / `sliceOf`, `state()`, `events` log,
  `readModel`, `stop`; asserts `expectCommitted` / `expectRejected` /
  `expectSlice` / `expectEvent`; LLM mocks `fixedProseLlm` /
  `scriptedToolLlm`.
- **Stable author error catalog E01–E26** (spec 03) в contracts:
  `MODULE_FAILURE_CODES` + caps constants; `moduleFailure(...)` helper.
- **Host composition** (spec 04): profiles `core-book | minimal | none`,
  `RP_MODULE_PROFILE` / `RP_MODULES` / `RP_DISABLE_MODULES`,
  `options.modules` exclusive override, `enabledModuleIds` /
  `disabledModuleIds`, `extraModules` always last, `listModules()`,
  CLI `--modules`, API `GET /modules`, structured boot log.
- **create-module recipes 1.0** (spec 05): `state | seed-narrative | guard |
  full | ai-tool | access-read | migrate | events` — все с harness-тестами
  (≥3) и секцией Public contract в README. CI scaffold smoke.
- **Slice migrations** (spec 05 §6): v1→v2 path с load upgrade;
  unmigratable version → fail load `MODULE_SLICE_UNMIGRATABLE` (E14).
- **IR JSON round-trip compat fixture** + engines validation (spec 01,
  polyglot-readiness).
- Stress suite S01–S22 + P01–P04 (spec 02) и atomicity pack A01–A09.
- `MODULE_SDK_VERSION = "1.0.0"`, `SDK_ENGINES_CORE` /
  `SDK_ENGINES_CONTRACTS = "^1.0.0"`.

### Changed

- `ctx.op` / mutate в write-forbidden моментах: silent collect-and-drop →
  **fail-loud** `MODULE_MOMENT_OP_FORBIDDEN` (E15).
- unknown `readModel` → fail-loud (никогда `undefined`).
- strict capabilities ON by default (host + harness).
- Рабочие тесты авторов: harness = SoT; `createTestEngine` — advanced escape.

### Breaking (vs 0.x)

- `committed` + `ctx.op` теперь fail-loud (0.x: тихий drop).
- Missing `requires` на дефолтном хосте — boot fail.
- Emit вне post-outcome моментов — fail-loud.
- См. compatibility.md §8 (migration notes).

---

## 0.1.x (до stamp)

Исторические записи не публикуются; для истории изменений используйте git log
и спеки 01–07. После 1.0.0 каждая будущая версия получает запись здесь.