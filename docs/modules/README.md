# Как сделать свой модуль

> **Один путь:** пакет `@rpengineext/module-sdk` и функция `defineModule`.  
> Лезть в core, pipeline stages и «ports» **не нужно**.

Норматив: [ADR 0004](../adr/0004-module-sdk-cbmd.md) · API-пакет: [`packages/module-sdk`](../../packages/module-sdk/README.md)

---

## 1. За 30 секунд

Ты **не** пишешь игровой цикл.

Ты описываешь кусок геймплея:

1. **Что храним** в сейве (`state` + операции `ops`)
2. **Когда реагируем** на ход (`turn`, `rules`, `seed`)
3. **Что говорим LLM** (`narrative`)
4. Опционально: **AI-задачи**, **статус в UI**, **конфиг**

Мир меняется **только через ops** (`ctx.op("…")`).  
Ход **атомарный**: либо весь успех, либо полный откат.

```text
Игрок написал текст
    → движок прогнал ход
    → твой модуль: можно запретить / поменять state / подсказать LLM
    → commit или reject
```

---

## 2. Пошагово: первый модуль за 5 минут

### Шаг 1. Сгенерировать пакет

Из корня репо:

```bash
bun run create-module mood
# или сразу с рецептом:
bun run create-module lore --recipe seed-narrative
```

Рецепты: `state` | `seed-narrative` | `guard` | `full`

Появится примерно:

```text
packages/modules/mood/
  package.json
  README.md
  src/index.ts      ← defineModule здесь
  tests/mood.test.ts
```

```bash
bun install
bun test packages/modules/mood
```

### Шаг 2. Открыть `src/index.ts` и понять скелет

Минимальный модуль «настроение растёт каждый ход»:

```ts
import { defineModule, deny } from "@rpengineext/module-sdk";
import { z } from "zod";

export function createMoodModule() {
  return defineModule({
    // --- кто ты ---
    id: "mood",           // уникальный id (kebab-case)
    version: "0.1.0",
    title: "Mood",
    description: "Простой счётчик настроения",
    priority: 100,        // меньше = раньше (обычно 10–100)

    // --- что храним в сейве ---
    state: {
      // имя slice по умолчанию: mood (дефисы → подчёркивания)
      schema: z
        .object({
          schemaVersion: z.literal(1),
          level: z.number().int(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, level: 0 },

      // именованные операции над slice (попадают в journal)
      ops: {
        bump: (s, p: { by?: number }) => ({
          ...s,
          level: s.level + (Number(p.by) || 1),
        }),
      },
    },

    // --- реакция на ход ---
    turn: {
      // до текста истории: меняем мир
      change(ctx) {
        ctx.op("bump", { by: 1 });
      },
    },

    // --- запреты ---
    rules: {
      guard(ctx) {
        const text = (
          ctx.normalizedAction as { text?: string } | undefined
        )?.text?.trim();
        if (text === "nope") {
          deny("MOOD_BLOCKED", "Сейчас нельзя.");
        }
      },
    },

    // --- что видит LLM ---
    narrative: {
      system: ({ slice }) => {
        const s = slice as { level: number };
        return `Настроение героя: ${s.level}. Учитывай это в тоне сцены.`;
      },
    },
  });
}
```

### Шаг 3. Написать 3 теста

```ts
import { describe, expect, test } from "bun:test";
import { createTestEngine } from "@rpengineext/core/testing";
import { createMoodModule } from "../src/index.ts";

describe("mood", () => {
  test("success: ход поднимает level", async () => {
    const created = await createTestEngine({
      modules: [createMoodModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "смотрю вокруг",
    });
    expect(turn.status).toBe("committed");

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices.mood as { level: number };
    expect(slice.level).toBe(1);
  });

  test("error: guard режет ход", async () => {
    const created = await createTestEngine({ modules: [createMoodModule()] });
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "nope",
    });
    expect(turn.status).toBe("rejected");
  });

  test("edge: модуль отдаёт IR", () => {
    const mod = createMoodModule();
    expect(mod.compiled).toBeTruthy();
    expect(mod.ir?.irVersion).toBe(1);
  });
});
```

Или короче через harness:

```ts
import { testModule } from "@rpengineext/module-sdk/test";

const t = await testModule(createMoodModule());
// t.ok → t.value.turn("привет")
```

### Шаг 4. Подключить к хосту

В monorepo модуль подключают там, где собирается engine (обычно `host-bootstrap`):

```ts
import { createMoodModule } from "@rpengineext/module-mood";

modules: [
  createWorkingMemoryModule({ windowPairs }),
  createCharacterModule(),
  createWorldCanonModule(),
  createMoodModule(), // ← твой
]
```

И в root/workspace `package.json` dependency, если пакет новый (workspaces `packages/modules/*` часто подхватывают сами).

### Шаг 5. Готово

```bash
bun test packages/modules/mood
bun run cli:hello   # или api / web — как принято в проекте
```

---

## 3. Карта «хочу → пишу»

| Хочу | Блок в `defineModule` | Пример |
|------|------------------------|--------|
| Хранить данные в сейве | `state` + `ops` | инвентарь, флаги, счётчики |
| Посеять из story JSON | `seed` | `meta.worldCanon`, `meta.character` |
| Запретить действие | `rules.guard` + `deny()` | «нельзя войти» |
| Предупредить, не стопать | `rules.soft` | мягкие warning |
| Менять мир **до** текста | `turn.change` + `ctx.op` | потратить предмет |
| Менять мир **после** prose | `turn.afterProse` + `ctx.op` | записать реплику в память |
| После успешного хода | `turn.committed` | `ctx.scheduleSystem(...)` фон |
| Подсказать LLM (system) | `narrative.system` | канон, профиль PC |
| Краткие факты в brief | `narrative.brief` | `{ present: true }` |
| История чата в LLM | `narrative.history` | last-N пар |
| Строка в статус-панели | `host.status` | «Outfit: …» |
| Справка `/help` | `host.help` | топик модуля |
| Настройка из конфига | `config` | размер окна памяти |
| Фоновый LLM + tool | `ai.tasks` + `ai.tools` | sync одежды |
| Читать чужой slice | `access.read` | только read, не write |

---

## 4. Рецепты (копируй и меняй)

### 4.1. Только seed + текст в system prompt  
*(как `world-canon`)*

```ts
defineModule({
  id: "lore",
  version: "0.1.0",
  title: "Lore",
  state: {
    schema: z.object({
      schemaVersion: z.literal(1),
      present: z.boolean(),
      text: z.string(),
    }).strict(),
    initial: { schemaVersion: 1 as const, present: false, text: "" },
    ops: {
      seed: {
        payload: z.object({ text: z.string().min(1) }).strict(),
        apply: (_s, p) => ({
          schemaVersion: 1 as const,
          present: true,
          text: p.text.trim(),
        }),
      },
    },
  },
  seed: {
    fromMeta: "lore",           // session.meta.lore
    parse: z.string().min(1),
    apply: (text, ctx) => {
      ctx.op("seed", { text: String(text).trim() });
    },
  },
  narrative: {
    system: ({ slice }) => {
      const s = slice as { present: boolean; text: string };
      if (!s.present) return null;
      return {
        title: "LORE",
        text: s.text,
        priority: 10,
      };
    },
  },
});
```

Story / startSession:

```ts
await engine.startSession({
  meta: { lore: "В этом городе магия вне закона." },
});
```

### 4.2. Память хода (afterProse)  
*(как `working-memory`, упрощённо)*

```ts
turn: {
  afterProse(ctx) {
    if (ctx.turnKind !== "player") return;
    if (ctx.action?.kind !== "free_text") return;
    const user = ctx.action.text?.trim();
    const assistant = ctx.passage?.prose.trim();
    if (!user || !assistant) return;
    ctx.op("append_pair", {
      turnId: ctx.passage!.turnId,
      user,
      assistant,
      createdAt: new Date().toISOString(),
    });
  },
},
narrative: {
  history: ({ slice }) => {
    // верни [{ role: "user"|"assistant", content: string }, ...]
    return buildHistory(slice);
  },
},
```

### 4.3. Guard

```ts
rules: {
  guard(ctx) {
    const text = (ctx.normalizedAction as { text?: string })?.text ?? "";
    if (text.includes("чит")) {
      deny("CHEAT", "Так нельзя.");
    }
  },
},
```

`deny(code, message)` **бросает** отказ хода. Не нужно возвращать `Result`.

### 4.4. Статус в CLI/UI

```ts
host: {
  status: ({ slice }) => {
    const s = slice as { name: string; hp: number };
    return [{ slot: "pc.hp", text: `${s.name}: ${s.hp} HP` }];
  },
  help: [
    { id: "pc", body: "Модуль следит за HP персонажа." },
  ],
},
```

### 4.5. Конфиг хоста

```ts
config: {
  key: "mood", // moduleConfig.mood
  schema: z.object({ step: z.number().int().positive() }).strict() as never,
  defaults: { step: 1 },
},
turn: {
  change(ctx) {
    const step = Number((ctx.config as { step: number }).step);
    ctx.op("bump", { by: step });
  },
},
```

Хост:

```ts
createEngine({
  modules: [createMoodModule()],
  config: {
    moduleConfig: { mood: { step: 2 } },
  },
});
```

Фабрика может зафиксировать дефолт:

```ts
defineModule({ ... }, { factoryConfig: { step: 2 } });
```

### 4.6. Фоновый system-turn (идея character outfit)

```ts
turn: {
  committed(ctx) {
    if (ctx.turnKind !== "player") return;
    if (ctx.action?.kind !== "free_text") return;
    ctx.scheduleSystem({
      reason: "my_module.sync",
      mode: "background", // или "inline"
      payload: { /* что нужно агенту */ },
    });
  },
},
ai: {
  tasks: {
    sync: {
      description: "…",
      input: MyInputSchema as never,
      output: MyOutputSchema as never,
      optional: true,
      tools: ["apply"],
      runOn: { systemReason: "my_module.sync" },
      messages: (input) => [/* system + user */],
    },
  },
  tools: {
    apply: {
      description: "Применить изменение",
      args: z.object({ value: z.string() }).strict() as never,
      handler(args, ctx) {
        // НЕ пишет state напрямую — только op (proposal protocol)
        ctx.proposeOp("set_value", { value: String(args.value) });
        return { ok: true };
      },
    },
  },
},
```

Смотри эталон: `packages/modules/character`.

---

## 5. `ctx` — что можно в хендлере

| Поле / метод | Зачем |
|--------------|--------|
| `ctx.slice` | текущий slice модуля (draft-aware) |
| `ctx.config` | твой moduleConfig |
| `ctx.op("name", payload?)` | предложить op → StateCommand |
| `ctx.proposeOp(...)` | то же (удобно в tools) |
| `ctx.action` / `normalizedAction` | ввод игрока |
| `ctx.passage` | prose (afterProse / committed) |
| `ctx.turnKind` | `player` \| `system` \| … |
| `ctx.meta` | session meta (seed) |
| `ctx.scheduleSystem(...)` | только смысл в `committed` |
| `ctx.readSlice("other")` | если объявлен `access.read` |
| `ctx.note(title, body?)` | отладка в turn trace |
| `deny(code, msg)` | отменить ход / op |

**Нельзя:** звать OpenAI SDK, писать в `state` руками, ждать «полу-commit».

---

## 6. Два синтаксиса — одна модель

**Простой (object sugar)** — для большинства модулей:

```ts
defineModule({ id, state, seed, turn, narrative })
```

**Составной (capabilities)** — когда модуль большой:

```ts
import { defineModule, stateCap, narrativeCap, turnCap } from "@rpengineext/module-sdk";

defineModule({
  id: "big",
  version: "1.0.0",
  title: "Big",
  capabilities: [
    stateCap({ ... }),
    narrativeCap({ ... }),
    turnCap({ ... }),
  ],
});
```

Это **не** два разных API — sugar превращается в тот же список capabilities.

---

## 7. Живые эталоны в репо

| Пакет | Чему учит |
|-------|-----------|
| [`module-world-canon`](../../packages/modules/world-canon) | seed + system narrative |
| [`module-working-memory`](../../packages/modules/working-memory) | afterProse + history + config |
| [`module-character`](../../packages/modules/character) | seed + narrative + host + ai + schedule |

Читай `src/index.ts` — там весь модуль, без зоопарка handlers.

---

## 8. Частые ошибки

| Ошибка | Как правильно |
|--------|----------------|
| Забыл `schemaVersion` в slice | всегда `schemaVersion: 1` (или миграции) |
| `ctx.op("foo")`, а op не объявлен | имя op = ключ в `state.ops` |
| Пишешь state в `committed` | только observe / `scheduleSystem` |
| LLM SDK в модуле | только `ai.tasks` / tools движка |
| Зависимость на `@rpengineext/core` в prod | peer/dep: **module-sdk**; core — для тестов |
| Думаешь, что нужен Guard port | пиши `rules.guard` |

---

## 9. Чеклист перед PR

- [ ] Уникальный `id`, semver `version`, понятный `title`
- [ ] State только через `ops`
- [ ] ≥3 теста: success / reject или error / edge
- [ ] README модуля: что чувствует игрок
- [ ] Нет импортов core internals / ports
- [ ] `bun test packages/modules/<id>` зелёный

---

## 10. Куда смотреть дальше

| Документ | Когда |
|----------|--------|
| Этот файл | старт и рецепты |
| [`_template.md`](./_template.md) | копипаста скелета |
| [`packages/module-sdk/README.md`](../../packages/module-sdk/README.md) | краткий API / IR (для любопытных) |
| [ADR 0004](../adr/0004-module-sdk-cbmd.md) | почему так устроено |
| Architecture 03/06/12 | **только maintainers**, не для написания модуля |

---

## Maintainers

| Doc | Role |
|-----|------|
| [../architecture/12-extension-surface.md](../architecture/12-extension-surface.md) | ports bus (internal) |
| [../architecture/03-module-system.md](../architecture/03-module-system.md) | runtime modules |
| [../adr/0005-moments-native-core.md](../adr/0005-moments-native-core.md) | future core (deferred) |
| `bun run test:compat` | не ломать sdk↔core |
