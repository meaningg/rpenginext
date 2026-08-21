# Рецепты модулей

Короткие паттерны «хочу X».  
Без Zod-шума: схемы — имена (`LoreSliceSchema`); как их писать → [schemas.md](./schemas.md).  
Полный каталог API → [sdk-reference.md](./sdk-reference.md).

Все фрагменты живут **внутри** `defineModule({ … })`, если не сказано иное.

Тесты авторов: `@rpengineext/module-sdk/test` (§10).  
Scaffold recipes сейчас: `state | seed-narrative | guard | full`; Platform 1.0: + `ai-tool | access-read | migrate` ([spec 05](../specs/05-scaffold-and-migrations.md)).

---

## 1. Seed + system prompt

*Эталон: `module-world-canon`*

**Идея:** при new game взять текст из `session.meta`, положить в slice, каждый ход отдавать LLM как system-секцию.

```ts
defineModule({
  id: "lore",
  version: "0.1.0",
  title: "Lore",

  state: {
    schema: LoreSliceSchema,
    initial: { schemaVersion: 1, present: false, text: "" },
    ops: {
      seed: {
        payload: SeedLorePayloadSchema, // { text: string }
        apply: (_s, p) => ({
          schemaVersion: 1,
          present: true,
          text: p.text.trim(),
        }),
      },
    },
  },

  seed: {
    fromMeta: "lore",
    parse: LoreMetaSchema, // например непустая string
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
    brief: ({ slice }) => {
      const s = slice as { present: boolean; text: string };
      return s.present
        ? { present: true, charCount: s.text.length }
        : { present: false };
    },
  },
});
```

Host:

```ts
await engine.startSession({
  meta: { lore: "В этом городе магия вне закона." },
});
```

---

## 2. Память хода (afterProse + history)

*Эталон: `module-working-memory`*

**Идея:** после prose записать пару user/assistant; в prompt отдать last-N как `history`.

```ts
state: {
  schema: MemorySliceSchema,
  initial: { schemaVersion: 1, entries: [] },
  ops: {
    append_pair: {
      payload: AppendPairPayloadSchema,
      apply: (s, p) => ({
        ...s,
        entries: [
          ...s.entries,
          {
            turnId: p.turnId,
            user: p.user,
            assistant: p.assistant,
            createdAt: p.createdAt,
          },
        ],
      }),
    },
  },
},

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
  history: ({ slice, config }) => {
    const s = slice as { entries: Pair[] };
    const n = (config as { windowPairs?: number }).windowPairs ?? 8;
    return buildPromptHistory(s.entries, n);
    // → [{ role: "user"|"assistant", content: string }, ...]
  },
  brief: ({ slice, config }) => ({
    totalPairs: (slice as { entries: unknown[] }).entries.length,
    windowPairs: (config as { windowPairs?: number }).windowPairs ?? 8,
  }),
},
```

Почему не `change`? В `change` ещё **нет** `passage.prose`.

---

## 3. Guard

**Идея:** до любых изменений мира отменить ход.

```ts
import { deny } from "@rpengineext/module-sdk";

rules: {
  guard(ctx) {
    const text =
      (ctx.normalizedAction as { text?: string } | undefined)?.text ?? "";
    if (text.includes("чит")) {
      deny("CHEAT", "Так нельзя.");
    }
  },
},
```

- `deny` **бросает** — не пиши `return deny(...)`.
- Для «мягко предупредить» используй `rules.soft` → `string[]` (ход идёт дальше).

---

## 4. Status + help

*Эталон status: `module-character`*

```ts
host: {
  status: ({ slice }) => {
    const s = slice as { name: string; hp: number; present: boolean };
    if (!s.present) return [];
    return [{ slot: "pc.hp", text: `${s.name}: ${s.hp} HP` }];
  },
  help: [
    { id: "pc", body: "Модуль следит за HP персонажа." },
  ],
},
```

`slot` — стабильный ключ для UI. Пустой массив = «нечего показывать».

Read-model (снимок для API/CLI):

```ts
host: {
  readModels: {
    "inventory.list": (state, _args, _config) => {
      const raw = state.slices.inventory;
      return { items: raw /* … */ };
    },
  },
},
```

---

## 5. Config

*Эталон: `module-working-memory`*

```ts
config: {
  key: "mood", // → moduleConfig.mood
  schema: MoodConfigSchema, // { step: number }
  defaults: { step: 1 },
},

turn: {
  change(ctx) {
    const step = Number((ctx.config as { step: number }).step) || 1;
    ctx.op("bump", { by: step });
  },
},
```

Host:

```ts
createEngine({
  modules: [createMoodModule()],
  config: {
    moduleConfig: { mood: { step: 2 } },
  },
});
```

Дефолт на фабрике:

```ts
export function createMoodModule(opts: { step?: number } = {}) {
  return defineModule(
    { /* id, state, turn, config… */ },
    { factoryConfig: { step: opts.step ?? 1 } },
  );
}
```

---

## 6. AI + фоновый system turn

*Эталон: `module-character` (outfit sync)*

**Идея:** после успешного player-хода поставить system turn → agent task → tool → `proposeOp`.

В `committed` **нельзя** `ctx.op` (observe + `scheduleSystem` only; Platform 1.0 — fail loud).

```ts
turn: {
  committed(ctx) {
    if (ctx.turnKind !== "player") return;
    if (ctx.action?.kind !== "free_text") return;

    const userText = ctx.action.text?.trim() ?? "";
    const prose = ctx.passage?.prose.trim() ?? "";
    if (!userText || !prose) return;

    ctx.scheduleSystem({
      reason: "my_module.sync",
      mode: "background", // или "inline"
      payload: {
        sourceTurnId: ctx.passage!.turnId,
        userText,
        prose,
      },
    });
  },
},

ai: {
  tasks: {
    sync: {
      description: "Решить, нужно ли обновить X",
      input: SyncInputSchema,
      output: SyncOutputSchema,
      optional: true,
      timeoutMs: 20_000,
      maxToolRounds: 3,
      temperature: 0.2,
      tools: ["apply"],
      runOn: { systemReason: "my_module.sync" },
      messages: (input) => [
        { role: "system", content: "Ты аккуратно обновляешь состояние…" },
        { role: "user", content: JSON.stringify(input) },
      ],
    },
  },
  tools: {
    apply: {
      description: "Применить изменение",
      args: ApplyArgsSchema,
      handler(args, ctx) {
        // state только через proposal protocol
        ctx.proposeOp("set_value", { value: String(args.value) });
        return { ok: true };
      },
    },
  },
},
```

Чеклист связки:

1. `reason` в `scheduleSystem` === `runOn.systemReason`
2. tool local key ∈ `tasks.*.tools`
3. op в `proposeOp` объявлен в `state.ops`
4. в `committed` **нет** прямых `op` «в обход» system turn (мир уже committed)

---

## 7. Change до prose (ресурс / флаг)

**Идея:** списать предмет или поднять счётчик **до** генерации текста, чтобы narrative видел новый slice.

```ts
turn: {
  change(ctx) {
    const text =
      (ctx.normalizedAction as { text?: string } | undefined)?.text ?? "";
    if (!text.includes("выпить зелье")) return;

    const s = ctx.slice as { potions: number };
    if (s.potions <= 0) {
      deny("NO_POTION", "Зелий нет.");
    }
    ctx.op("use_potion", {});
  },
},

narrative: {
  system: ({ slice }) => {
    const s = slice as { potions: number };
    return `Зелий осталось: ${s.potions}.`;
  },
},
```

---

## 8. Composition-синтаксис (capabilities[])

Когда модуль большой и хочется дробить объявление:

```ts
import {
  defineModule,
  stateCap,
  turnCap,
  narrativeCap,
} from "@rpengineext/module-sdk";

defineModule({
  id: "big",
  version: "1.0.0",
  title: "Big",
  capabilities: [
    stateCap({
      schema: BigSliceSchema,
      initial: { schemaVersion: 1, … },
      ops: { /* … */ },
    }),
    turnCap({
      change(ctx) { /* … */ },
    }),
    narrativeCap({
      system: ({ slice }) => /* … */,
    }),
  ],
});
```

Это **то же API**, не второй диалект. Sugar-поля и `capabilities` можно комбинировать.

---

## 9. Read чужого slice

```ts
access: {
  read: ["character"],
},

turn: {
  change(ctx) {
    const pc = ctx.readSlice<{ present: boolean; outfit: string }>("character");
    if (!pc?.present) return;
    // своя логика; писать можно только в свой slice через ctx.op
  },
},
```

---

## 10. Тестовый каркас

**SoT:** harness ниже. `createTestEngine` — только advanced/maintainer.

```ts
import { describe, expect, test } from "bun:test";
import { testModule } from "@rpengineext/module-sdk/test";
import { createMoodModule } from "../src/index.ts";

describe("mood", () => {
  test("success", async () => {
    const t = await testModule(createMoodModule());
    expect(t.ok).toBe(true);
    if (!t.ok) return;

    const turn = await t.value.turn("смотрю вокруг");
    expect(turn.status).toBe("committed");
    expect((t.value.slice as { level: number }).level).toBe(1);
  });

  test("reject", async () => {
    const t = await testModule(createMoodModule());
    if (!t.ok) return;
    const turn = await t.value.turn("nope");
    expect(turn.status).toBe("rejected");
  });

  test("edge: ir", () => {
    const mod = createMoodModule();
    expect(mod.ir?.irVersion).toBe(1);
  });
});
```

С meta (seed):

```ts
await testModule(createLoreModule(), {
  meta: { lore: "Канон…" },
});
```

С moduleConfig:

```ts
await testModule(createMoodModule(), {
  moduleConfig: { mood: { step: 3 } },
});
```

---

## Куда дальше

| Нужно | Документ |
|-------|----------|
| Все поля и границы | [sdk-reference.md](./sdk-reference.md) |
| Как писать Zod | [schemas.md](./schemas.md) |
| Старт с нуля | [README.md](./README.md) |
| Platform 1.0 (harness/host/errors) | [../specs/README.md](../specs/README.md) |
| Живой код | `packages/modules/*` |
