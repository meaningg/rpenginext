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
| [**compatibility.md**](./compatibility.md) | Политика совместимости SDK 1.x (semver, IR, gates) |
| [**errors.md**](./errors.md) | Каталог E01–E26: коды + fix hints |
| [**conventions.md**](./conventions.md) | Priority bands, readModel, events, lifecycle, public contract |
| [**../specs/README.md**](../specs/README.md) | **Module Platform 1.0** — freeze, harness, CI, host, release DoD (maintainers / platform work) |

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

Десять capability-блоков. Подробности — только в reference.

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
| `events` | publish/subscribe push-уведомлений (1.0) |

Мета модуля: `id`, `version`, `title`, `priority`, `provides` / `requires`.  
Lifecycle hooks: `init` / `shutdown` (опциональны, 1.0).

---

## Первый модуль за 5 минут

### 1. Scaffold

```bash
bun run create-module mood
# или с рецептом:
bun run create-module lore --recipe seed-narrative
```

Рецепты scaffold (все 8 для Platform 1.0):

```text
state | seed-narrative | guard | full | ai-tool | access-read | migrate | events
```

```bash
bun run create-module mood                  # state
bun run create-module lore --recipe seed-narrative
bun run create-module stats --recipe migrate
bun run create-module notify --recipe events
```

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

**SoT для авторов (1.0):** `@rpengineext/module-sdk/test`.  
`createTestEngine` (`@rpengineext/core/testing`) — advanced/maintainer escape, не основной путь.

```ts
import { describe, expect, test } from "bun:test";
import {
  testModule,
  expectCommitted,
  expectRejected,
  expectSlice,
  expectEvent,
} from "@rpengineext/module-sdk/test";
import { createMoodModule } from "../src/index.ts";

describe("mood", () => {
  test("success: ход поднимает level", async () => {
    const t = await testModule(createMoodModule());
    expect(t.ok).toBe(true);
    if (!t.ok) return;

    const turn = await t.value.turn("смотрю вокруг");
    expectCommitted(turn);
    expectSlice(t.value, "mood", { level: 1 });
  });

  test("error: guard режет ход", async () => {
    const t = await testModule(createMoodModule());
    if (!t.ok) return;
    const turn = await t.value.turn("nope");
    expectRejected(turn, "MOOD_BLOCKED");
  });

  test("edge: модуль отдаёт IR", () => {
    const mod = createMoodModule();
    expect(mod.compiled).toBeTruthy();
    expect(mod.ir?.irVersion).toBe(1);
  });
});
```

Полный harness: `testModules`, `action`, `systemTurn`, `waitIdle`, `save`/`load`, `events` log + `expectEvent`, `readModel`, `fixedProseLlm` / `scriptedToolLlm` — [sdk-reference §6](./sdk-reference.md#6-утилиты-и-прочий-public-api) и [spec 02](../specs/02-testing-harness-stress-ci.md).

### 4. Подключить к host

**Без кода (рекомендуется, ADR 0006):** пакет, положенный в `packages/modules/`
(create-module уже пишет поле `rpengineext.module` в `package.json`), сам попадает
в id-пул хоста — подключение = одна env-строка:

```bash
RP_MODULES=mood bun run cli --modules    # модуль обнаружен и загружен
```

**1.0 классика:** profiles / env / catalog (spec 04):

```bash
# default = core-book (wm + canon + character)
RP_MODULE_PROFILE=minimal          # working-memory only
RP_MODULES=working-memory,character
RP_DISABLE_MODULES=character       # drop character from resolved set
RP_MODULE_DIRS=packages/modules    # discovery roots (default); comma-list
```

Либо кодом (приоритет: `options.modules` > env > profile):

```ts
await createHostRuntime({
  extraModules: [createMoodModule()],            // всегда после resolution
  // moduleProfile, enabledModuleIds, disabledModuleIds, modules (exclusive), moduleDirs
});
```

Discovery — это **пул, а не автозагрузка**: модуль адресуется по id/
(`RP_MODULES`, `enabledModuleIds`, unknown-подсказки), но загружается только
при явном выборе. Детали: [ADR 0006](../adr/0006-local-module-discovery.md).

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
| Стабильный cross-module query | `ctx.readModel` | [reference → ModuleCtx](./sdk-reference.md#5-modulectx--полный-reference) |
| Уведомить другие модули | `events` (emit в committed/rejected) | [reference → events](./sdk-reference.md#events) |
| Поднять ресурсы при boot / закрыть при stop | `init` / `shutdown` | [reference → lifecycle](./sdk-reference.md#lifecycle-hooks-init--shutdown-spec-06-8) |
| Менять schema slice без потери сейвов | `state.migrations` | [рецепт](./recipes.md#11-migrations-совместимость-сейвов) |
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
- [ ] Public contract в README: provides/requires, slice+schemaVersion, meta keys, config key, readModels, events, system reasons/tools
- [ ] Runtime deps: `module-sdk` + `zod` only; нет `module-*` → `module-*`
- [ ] Нет импортов core internals / ports / LLM SDK
- [ ] `bun test packages/modules/<id>` зелёный
- [ ] `bun run test:module-boundaries` зелёный

---

## Maintainers (не для авторов модулей)

| Doc | Role |
|-----|------|
| [../architecture/12-extension-surface.md](../architecture/12-extension-surface.md) | ports bus (internal) |
| [../architecture/03-module-system.md](../architecture/03-module-system.md) | runtime modules |
| [../adr/0005-moments-native-core.md](../adr/0005-moments-native-core.md) | deferred: моменты-native core (не реализовано; sdk↔ports dual-path остаётся) |
| `bun run test:compat` | не ломать sdk ↔ core |
