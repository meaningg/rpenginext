# Как сделать свой модуль

> **Один путь:** пакет `@rpengineext/module-sdk` и `defineModule`.  
> Лезть в core, pipeline stages и ports **не нужно**.

Норматив: [ADR 0004](../adr/0004-module-sdk-cbmd.md)

---

## Куда идти

| Документ | Зачем читать |
|----------|----------------|
| **Этот файл** | 5‑минутный старт и карта документации |
| [**sdk-reference.md**](./sdk-reference.md) | **Полный** каталог SDK: capabilities, `ctx`, lifecycle, запреты |
| [**recipes.md**](./recipes.md) | Короткие паттерны «хочу X» без Zod-шума |
| [**schemas.md**](./schemas.md) | Как описывать state/config/AI через Zod (один раз) |
| [`_template.md`](./_template.md) | Скелет для копипасты |
| [`packages/module-sdk/README.md`](../../packages/module-sdk/README.md) | Витрина пакета (коротко) |
| [**../specs/README.md**](../specs/README.md) | **Module Platform 1.0** — freeze, harness, CI, host, release DoD (maintainers / platform work) |
| `compatibility.md` / `errors.md` / `conventions.md` | Platform 1.0 artifacts (appear as specs 01/03/04/06 land) |

Если нужно **понять, что вообще умеет SDK** — сразу в [reference](./sdk-reference.md).  
Если нужно **быстро набросать модуль** — разделы ниже + [recipes](./recipes.md).

---

## Идея за 30 секунд

Ты **не** пишешь игровой цикл.

Ты описываешь кусок геймплея:

1. **Что храним** в сейве (`state` + операции `ops`)
2. **Когда реагируем** на ход (`turn`, `rules`, `seed`)
3. **Что говорим LLM** (`narrative`)
4. Опционально: **AI-задачи**, **статус в UI**, **конфиг**, **доступ к чужим slice**

Мир меняется **только через ops** (`ctx.op("…")`).  
Ход **атомарный**: либо весь успех, либо полный откат.

```text
Игрок написал текст
    → движок прогнал ход
    → твой модуль: можно запретить / поменять state / подсказать LLM
    → commit или reject
```

Полная timeline: [lifecycle в reference](./sdk-reference.md#2-lifecycle-хода).

---

## Карта возможностей (обзор)

Девять capability-блоков. Подробности — только в reference.

| Блок | Зачем в одном предложении |
|------|---------------------------|
| `state` | Свой slice в сейве + именованные `ops` |
| `seed` | Посев из `session.meta` при new game |
| `rules` | `guard` / `soft` / `invariant` |
| `turn` | Moments: `change`, `afterProse`, `committed`, `rejected`, `load` |
| `narrative` | system/user текст, brief, history, style |
| `ai` | tasks + tools движка (без своего LLM SDK) |
| `host` | status-панель, help, readModels |
| `config` | секция `moduleConfig` |
| `access` | read чужих slice (write чужих — нельзя) |

Мета модуля: `id`, `version`, `title`, `priority`, `provides` / `requires`.

---

## Первый модуль за 5 минут

### 1. Scaffold

```bash
bun run create-module mood
# или с рецептом:
bun run create-module lore --recipe seed-narrative
```

Рецепты scaffold (сейчас): `state` | `seed-narrative` | `guard` | `full`  
Platform 1.0 добавит: `ai-tool` | `access-read` | `migrate` — [spec 05](../specs/05-scaffold-and-migrations.md)

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

### 2. Скелет (логика, без Zod-шума)

Схемы вынесены в имена типов — как писать Zod: [schemas.md](./schemas.md).

```ts
import { defineModule, deny } from "@rpengineext/module-sdk";
// MoodSlice, MoodSliceSchema — см. schemas.md

export function createMoodModule() {
  return defineModule({
    id: "mood",
    version: "0.1.0",
    title: "Mood",
    description: "Счётчик настроения",
    priority: 100, // меньше = раньше

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
        const text = (ctx.normalizedAction as { text?: string } | undefined)
          ?.text?.trim();
        if (text === "nope") {
          deny("MOOD_BLOCKED", "Сейчас нельзя.");
        }
      },
    },

    narrative: {
      system: ({ slice }) => {
        const s = slice as { level: number };
        return `Настроение героя: ${s.level}. Учитывай это в тоне сцены.`;
      },
    },
  });
}
```

### 3. Тесты (минимум 3) — harness first

**SoT для авторов:** `@rpengineext/module-sdk/test`.  
`createTestEngine` (`@rpengineext/core/testing`) — advanced/maintainer escape, не основной путь.

```ts
import { describe, expect, test } from "bun:test";
import { testModule } from "@rpengineext/module-sdk/test";
import { createMoodModule } from "../src/index.ts";

describe("mood", () => {
  test("success: ход поднимает level", async () => {
    const t = await testModule(createMoodModule());
    expect(t.ok).toBe(true);
    if (!t.ok) return;

    const turn = await t.value.turn("смотрю вокруг");
    expect(turn.status).toBe("committed");
    expect((t.value.slice as { level: number }).level).toBe(1);
  });

  test("error: guard режет ход", async () => {
    const t = await testModule(createMoodModule());
    if (!t.ok) return;
    const turn = await t.value.turn("nope");
    expect(turn.status).toBe("rejected");
  });

  test("edge: модуль отдаёт IR", () => {
    const mod = createMoodModule();
    expect(mod.compiled).toBeTruthy();
    expect(mod.ir?.irVersion).toBe(1);
  });
});
```

Platform 1.0 расширит harness (`testModules`, `save`/`load`, `waitIdle`, asserts, scripted tools) — [spec 02](../specs/02-testing-harness-stress-ci.md).

### 4. Подключить к host

**Сейчас (0.x):** `extraModules` в `createHostRuntime` (или правка списка в host-bootstrap).

```ts
import { createMoodModule } from "@rpengineext/module-mood";

await createHostRuntime({
  extraModules: [createMoodModule()],
});
```

**Platform 1.0:** profiles / `RP_MODULES` / catalog — [spec 04](../specs/04-host-composition.md). Не хардкодить product-модули в core.

### 5. Проверка

```bash
bun test packages/modules/mood
bun run cli:hello   # или api / web
```

---

## «Хочу → куда смотреть»

| Хочу | Capability | Документ |
|------|------------|----------|
| Хранить данные в сейве | `state` + `ops` | [reference → state](./sdk-reference.md#state) |
| Посеять из story JSON | `seed` | [recipe](./recipes.md#1-seed--system-prompt) |
| Запретить действие | `rules.guard` + `deny` | [recipe](./recipes.md#3-guard) |
| Предупредить, не стопать | `rules.soft` | [reference → rules](./sdk-reference.md#rules) |
| Менять мир **до** prose | `turn.change` | [reference → turn](./sdk-reference.md#turn) |
| Менять мир **после** prose | `turn.afterProse` | [recipe](./recipes.md#2-память-хода-afterprose--history) |
| Фон после commit | `turn.committed` + `scheduleSystem` | [recipe](./recipes.md#6-ai--фоновый-system-turn) |
| Текст в LLM | `narrative.*` | [reference → narrative](./sdk-reference.md#narrative) |
| Статус / help / read model | `host` | [recipe](./recipes.md#4-status--help) |
| Настройка из конфига | `config` | [recipe](./recipes.md#5-config) |
| Читать чужой slice | `access.read` | [reference → access](./sdk-reference.md#access) |
| Стабильный cross-module query | `ctx.readModel` (Platform 1.0) | [spec 06](../specs/06-inter-module-and-sdk-gaps.md) |
| Описать схему slice | Zod | [schemas.md](./schemas.md) |

---

## Живые эталоны

| Пакет | Чему учит |
|-------|-----------|
| [`module-world-canon`](../../packages/modules/world-canon) | seed + system narrative |
| [`module-working-memory`](../../packages/modules/working-memory) | afterProse + history + config + readModels |
| [`module-character`](../../packages/modules/character) | seed + narrative + host + ai + background system |

Читай `src/index.ts` — весь модуль в одном месте.

---

## Чеклист перед PR

- [ ] Уникальный `id`, semver `version`, понятный `title`
- [ ] State только через `ops` (и только в moments, где write разрешён)
- [ ] `committed` — observe + `scheduleSystem` only (не `ctx.op`)
- [ ] ≥3 теста через **`@rpengineext/module-sdk/test`**: success / reject / edge
- [ ] README модуля: что чувствует игрок (+ public contract when Platform 1.0)
- [ ] Runtime deps: `module-sdk` + `zod` only; нет `module-*` → `module-*`
- [ ] Нет импортов core internals / ports / LLM SDK
- [ ] `bun test packages/modules/<id>` зелёный

---

## Maintainers (не для авторов модулей)

| Doc | Role |
|-----|------|
| [../architecture/12-extension-surface.md](../architecture/12-extension-surface.md) | ports bus (internal) |
| [../architecture/03-module-system.md](../architecture/03-module-system.md) | runtime modules |
| [../adr/0005-moments-native-core.md](../adr/0005-moments-native-core.md) | future core (deferred) |
| `bun run test:compat` | не ломать sdk ↔ core |
