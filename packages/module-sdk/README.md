# `@rpengineext/module-sdk`

**Единственный public path** для авторов модулей.

Тебе **не** нужно знать: pipeline stages, ports, `ModuleRegisterContext`, ручные `StateCommand`.

---

## Документация (RU)

| Документ | Содержание |
|----------|------------|
| [`docs/modules/README.md`](../../docs/modules/README.md) | Старт за 5 минут |
| [`docs/modules/sdk-reference.md`](../../docs/modules/sdk-reference.md) | **Полный** каталог capabilities, `ctx`, lifecycle |
| [`docs/modules/recipes.md`](../../docs/modules/recipes.md) | Паттерны без Zod-шума |
| [`docs/modules/schemas.md`](../../docs/modules/schemas.md) | Как писать Zod-схемы |
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

Тесты: `@rpengineext/core/testing` или harness `@rpengineext/module-sdk/test`.

---

## Scaffold

```bash
bun run create-module my-feature
bun run create-module lore --recipe seed-narrative
# recipes: state | seed-narrative | guard | full
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
| `ctx.op("name", payload?)` | изменить **свой** мир |
| `deny(code, msg)` | отменить ход / op |
| `ctx.scheduleSystem(…)` | только из `committed` |
| `ctx.proposeOp` | в tool handler (= `op`) |
| `ctx.readSlice` | чужой slice при `access.read` |

---

## Тесты

```ts
import { testModule } from "@rpengineext/module-sdk/test";
// или
import { createTestEngine } from "@rpengineext/core/testing";
```

Минимум: success / reject / edge.

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

- `bun run test:compat` — не ломать sdk ↔ core  
- Deferred core moments: [ADR 0005](../../docs/adr/0005-moments-native-core.md)

Semver: additive capability fields = minor; breaking author/IR = major.
