# `@rpengineext/module-sdk`

**Единственный public path** для авторов модулей.

> **Полный гайд (пошагово, по-русски, с рецептами):**  
> [`docs/modules/README.md`](../../docs/modules/README.md)

Тебе **не** нужно знать: pipeline stages, ports, `ModuleRegisterContext`, ручные `StateCommand`.

---

## Установка (workspace)

```bash
# dependency модуля
"@rpengineext/module-sdk": "workspace:*"
```

Тесты: devDependency `@rpengineext/core` (или harness `@rpengineext/module-sdk/test`).

---

## Самый короткий пример

```ts
import { defineModule, deny } from "@rpengineext/module-sdk";
import { z } from "zod";

export function createMoodModule() {
  return defineModule({
    id: "mood",
    version: "0.1.0",
    title: "Mood",
    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          level: z.number().int(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, level: 0 },
      ops: {
        bump: (s, p: { by?: number }) => ({
          ...s,
          level: s.level + (Number(p.by) || 1),
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

## Scaffold

```bash
bun run create-module my-feature
bun run create-module lore --recipe seed-narrative
# recipes: state | seed-narrative | guard | full
```

---

## Capabilities (кратко)

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

---

## `ctx` в двух словах

- `ctx.op("name", payload)` — изменить **свой** мир  
- `deny(code, msg)` — отменить ход  
- `ctx.scheduleSystem(…)` — только из `committed`  
- `ctx.proposeOp` — в tool handler (то же, что op, через proposal protocol)

---

## Тесты

```ts
import { createTestEngine } from "@rpengineext/core/testing";
// или
import { testModule } from "@rpengineext/module-sdk/test";
```

Минимум: success / reject / edge. См. гайд.

---

## Эталоны

| Пакет | Паттерн |
|-------|---------|
| `module-world-canon` | seed + system prompt |
| `module-working-memory` | afterProse + history |
| `module-character` | ai + background system turn |

---

## Для maintainers (не для авторов модулей)

```text
defineModule
  → bindings + CompiledModuleIR
  → compiled.install = bindCompiledModule(ir, bindings)
  → core ModuleRegistry
```

- `bun run test:compat` — не ломать sdk↔core  
- ADR: [0004](../../docs/adr/0004-module-sdk-cbmd.md), deferred core: [0005](../../docs/adr/0005-moments-native-core.md)

Semver: additive capability fields = minor; breaking author/IR = major.
