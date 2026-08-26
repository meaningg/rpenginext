# Compatibility Policy — Module SDK 1.x (normative)

> Module Platform 1.0 · `@rpengineext/module-sdk` **1.0.0 frozen**.  
> Авторская поверхность заморожена: модули, написанные на 1.0.x только через
> документированный API, продолжают работать на 1.y без изменений кода.

Связанное: [sdk-reference](./sdk-reference.md) · [errors.md](./errors.md) ·
[conventions.md](./conventions.md) · [CHANGELOG.md](./CHANGELOG.md) ·
[ADR 0004](../adr/0004-module-sdk-cbmd.md) · [specs/01](../specs/01-sdk-contract-freeze.md).

---

## 1. SDK semver

Интерпретация semver для `@rpengineext/module-sdk`:

| Bump | Что входит | Требования к релизу |
|------|------------|---------------------|
| **MAJOR** | удаление/переименование author API; изменение moment permissions **или** semantics event dispatch (§6); IR break без dual-load; семантический break merge/invariants | миграционный гайд + CHANGELOG + compat-фикстуры нового мажора |
| **MINOR** | additive optional поля/kind; новые test helpers; новые recipes; новые события/опциональные lifecycle-хуки (не меняя dispatch semantics) | `test:compat` + `test:modules-stress` + `test:module-boundaries` зелёные |
| **PATCH** | docs; не-API bugfix | обычный PR |

Добавление нового capability kind после 1.0.0 = **minor** только если
опциональный и обратно совместимый. Удаление/переименование = **major**.

### Moment permissions — MAJOR surface

Таблица моментов в [sdk-reference](./sdk-reference.md#2-lifecycle-хода)
нормативная (spec 01 §4.2). Любое изменение прав моментов,
`event.dispatch` semantics или ctx-правил lifecycle-хуков = **MAJOR**.

## 2. IR (`MODULE_IR_VERSION`)

- IR и compiled manifest — **fully serializable (JSON)**: никаких функций,
  замыканий, zod-инстансов в IR. Валидация схем живёт в SDK bindings;
  опционально допускаются портируемые дескрипторы схем (JSON Schema).
  Жёсткий инвариант (spec 00 §4.11): foreign-language SDK (post-1.0) — второй
  producer того же IR и проходит те же engines-валидации.
- На IR shape break: bump версии; **dual-load policy** — поддержка N и N-1
  загрузчиков минимум один release cycle, либо документированный hard cut
  с major + миграционный гайд.
- На Module Platform 1.0 поддерживается **ровно одна IR-версия**:
  `MODULE_IR_VERSION = 1`, `SUPPORTED_MODULE_IR_VERSIONS = [1]` в
  `contracts`. Механизма N-1 нет — N-1 не существует до первого релиза.
- Будущий IR-разрыв = **MAJOR** + bump `MODULE_IR_VERSION` + (загрузчики
  N и N-1 на один release cycle **ИЛИ** документированный hard cut с
  миграционным гайдом) — как и требует spec 01 §5.2.
- Fixture: `packages/module-sdk/tests/compat/compat-ir-roundtrip.test.ts`
  (JSON round-trip, engines validation).

## 3. Engines

- `engines.core` / `engines.contracts` штампуются SDK
  (`SDK_ENGINES_CORE = "^1.0.0"`, `SDK_ENGINES_CONTRACTS = "^1.0.0"`).
- Boot валидирует диапазоны; несовместимость → stable
  `MODULE_ENGINES_INCOMPATIBLE` (E11), boot fail.
- Тест: compat fixtures (модуль с unsupported engines fails boot).

## 4. Author dependency rules

- Runtime deps модуля: **`@rpengineext/module-sdk` + `zod`** (только;
  + contracts если переиспользуются типы — предпочитай sdk).
- `@rpengineext/core` — **devDependency для тестов only**.
- Запрещено: deep imports `@rpengineext/core/src/...`, raw
  `ModuleRegisterContext` / `add*` / `register*`, stage interceptors,
  pipeline stage ids как extension API (spec 01 §4.4).
- `docs/architecture/12-extension-surface.md` — maintainer-only.

## 5. Как предложить additive API

1. Issue/PR с описанием авторского кейса и почему не выражается текущим SDK.
2. Реализация = additive optional в 1.x (minor), **без** изменения
   permissions/dispatch semantics.
3. Обязательные тесты: compat fixture (новое в IR/ctx) + `test:compat` +
   `test:modules-stress` + `test:module-boundaries`.
4. Если нужно менять moment permissions / event dispatch semantics — plan
   **major** с миграцией (CHANGELOG + docs).

## 6. CI gates

| Script | Когда обязателен |
|--------|------------------|
| `bun run test:compat` | **каждый** sdk/core PR (dual-path guard до ADR 0005) |
| `bun run test:modules-stress` | каждый sdk/core PR (N≥30 + события + lifecycle) |
| `bun run test:module-boundaries` | каждый sdk/core/module PR |
| `bun run typecheck` | workspace-wide |
| `bun run test:scaffold-smoke` | каждый create-module PR |
| `bun run test:platform` | release gate (spec 07) |

До ADR 0005 sdk ↔ ports bus dual-path является **load-bearing**: «быстрый»
bind bypass без compat-фикстур запрещён (spec 07 §11.7).

## 7. Stability promise

Модули, написанные на документированной поверхности 1.0.x, работают на 1.y
без изменений кода при условии: только `defineModule` + `@rpengineext/module-sdk/test`,
только документированные capability kinds 1.0, `engines` в диапазоне.
Изменение поведения, нарушающее это обещание, — **major** + миграция.

## 8. Breaking vs 0.x (migration notes at stamp)

Platform 1.0 формализует поведение, которое в 0.x было мягким:

| Поведение | 0.x | 1.0 |
|-----------|-----|-----|
| `ctx.op` в `committed` / write-forbidden moments | collect-and-drop | **fail-loud** `MODULE_MOMENT_OP_FORBIDDEN` (E15) |
| unknown `ctx.readModel` | silent `undefined` | **fail-loud** `MODULE_READ_MODEL_UNKNOWN` (E10) |
| `ctx.emit` вне post-outcome | не было API | fail-loud `MODULE_EVENT_EMIT_FORBIDDEN` (E19) |
| missing `requires` | warn | **boot fail** `MODULE_REQUIRES_MISSING` (E06, strict default) |
| host composition | hardcoded set | profiles / env / `modules` override (spec 04) |
| tests | raw `createTestEngine` | harness `@rpengineext/module-sdk/test` = SoT |