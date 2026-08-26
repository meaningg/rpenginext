# `@rpengineext/module-sdk`

**Единственный public path** для авторов модулей.

**Version: `1.0.0`** — **frozen** (Module Platform 1.0). Политика совместимости:
[`docs/modules/compatibility.md`](../../docs/modules/compatibility.md).  
Тебе **не** нужно знать: pipeline stages, ports, `ModuleRegisterContext`, ручные `StateCommand`.

---

## Документация (RU)

| Документ | Содержание |
|----------|------------|
| [`docs/modules/README.md`](../../docs/modules/README.md) | Старт за 5 минут |
| [`docs/modules/sdk-reference.md`](../../docs/modules/sdk-reference.md) | **Полный** каталог capabilities, `ctx`, lifecycle (**Normative SDK 1.0**) |
| [`docs/modules/recipes.md`](../../docs/modules/recipes.md) | Паттерны без Zod-шума |
| [`docs/modules/schemas.md`](../../docs/modules/schemas.md) | Как писать Zod-схемы |
| [`docs/modules/compatibility.md`](../../docs/modules/compatibility.md) | Семвер / IR / engines / gates |
| [`docs/modules/errors.md`](../../docs/modules/errors.md) | Каталог E01–E26 |
| [`docs/modules/conventions.md`](../../docs/modules/conventions.md) | Priority, readModel, events, lifecycle |
| [ADR 0004](../../docs/adr/0004-module-sdk-cbmd.md) | Почему так устроено |

---

## Установка (workspace)

```json
{
  "dependencies": {
    "@rpengineext/module-sdk": "workspace:*"
  },
  "devDependencies": {
    "@rpengineext/core": "workspace:*"
  }
}
```

Тесты авторов: **`@rpengineext/module-sdk/test`** (SoT).  
`@rpengineext/core/testing` — advanced/maintainer escape only.

---

## Scaffold

```bash
bun run create-module my-feature
bun run create-module lore --recipe seed-narrative
# recipes (all 8, Platform 1.0):
#   state | seed-narrative | guard | full
#   ai-tool | access-read | migrate | events
```

---

## Capabilities (обзор)

| Блок | Зачем |
|------|--------|
| `state` | slice + `ops` + migrations |
| `seed` | new game из `session.meta` |
| `rules` | `guard` / `soft` / `invariant` |
| `turn` | `change` · `afterProse` · `committed` · `rejected` · `load` |
| `narrative` | system/user · brief · history · style |
| `ai` | tasks + tools (без своего LLM SDK) |
| `host` | status · help · readModels |
| `config` | секция `moduleConfig` |
| `access` | read чужих slice (write чужих — нельзя) |
| `events` | **emit** / **subscribe** push-уведомлений (1.0) |

Тот же смысл через `capabilities: [stateCap(…), narrativeCap(…)]`.

Поля, моменты, `ctx` — только в [sdk-reference](../../docs/modules/sdk-reference.md).

---

## Самый короткий пример

Логика без Zod-шума (схемы — [schemas.md](../../docs/modules/schemas.md)):

```ts
import { defineModule, deny } from "@rpengineext/module-sdk";

export function createMoodModule() {
  return defineModule({
    id: "mood",
    version: "0.1.0",
    title: "Mood",
    state: {
      schema: MoodSliceSchema,
      initial: { schemaVersion: 1, level: 0 },
      ops: {
        bump: (s, p: { by?: number }) => ({
          ...s,
          level: s.level + (p.by ?? 1),
        }),
      },
    },
    turn: {
      change(ctx) {
        ctx.op("bump", { by: 1 });
      },
    },
    rules: {
      guard(ctx) {
        const text = (ctx.normalizedAction as { text?: string })?.text;
        if (text === "nope") deny("NOPE", "Нельзя.");
      },
    },
    narrative: {
      system: ({ slice }) =>
        `Настроение: ${(slice as { level: number }).level}`,
    },
  });
}
```

---

## `ctx` в двух словах

| API | Смысл |
|-----|--------|
| `ctx.op("name", payload?)` | изменить **свой** мир (только write-allowed moments) |
| `deny(code, msg)` | отменить ход / op |
| `ctx.scheduleSystem(…)` | только из `committed` / event handler |
| `ctx.proposeOp` | в tool handler (= `op`) |
| `ctx.readSlice` | чужой slice при `access.read` |
| `ctx.readModel(name)` | стабильный cross-module query (unknown → fail loud `MODULE_READ_MODEL_UNKNOWN`) |
| `ctx.emit(name, payload?)` | в `committed` / `rejected` / `event.dispatch` only (иначе E19) |
| `init` / `shutdown` | lifecycle hooks (опциональны, 1.0) |

`committed` + `ctx.op` → **запрещено** (fail loud `MODULE_MOMENT_OP_FORBIDDEN`; не silent-drop).

---

## Тесты

```ts
import {
  testModule, testModules,
  expectCommitted, expectRejected,
  expectSlice, expectEvent,
  fixedProseLlm, scriptedToolLlm,
} from "@rpengineext/module-sdk/test";

const t = await testModule(createMoodModule());
// t.ok → await t.value.turn("привет") → t.value.slice / expectEvent(...)
```

Минимум: success / reject / edge. Полный harness API — [spec 02](../../docs/specs/02-testing-harness-stress-ci.md).

---

## Эталоны

| Пакет | Паттерн |
|-------|---------|
| `module-world-canon` | seed + system prompt |
| `module-working-memory` | afterProse + history |
| `module-character` | ai + background system turn |

---

## Maintainers

```text
defineModule
  → bindings + CompiledModuleIR
  → compiled.install = bindCompiledModule(ir, bindings)
  → core ModuleRegistry
```

- `bun run test:compat` — не ломать sdk ↔ core (dual-path guard until ADR 0005)  
- Platform 1.0 gates: `test:modules-stress`, `test:module-boundaries`, `test:scaffold-smoke`, `test:platform` — [specs](../../docs/specs/README.md)  
- Deferred core moments-native: [ADR 0005](../../docs/adr/0005-moments-native-core.md)

Semver: additive capability fields = minor; breaking author/IR / moment permissions = major.  
**Frozen at `1.0.0`** (Module Platform 1.0) — [compatibility.md](../../docs/modules/compatibility.md).
