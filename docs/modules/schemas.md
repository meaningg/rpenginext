# Схемы (Zod) для модулей

В [reference](./sdk-reference.md) и [recipes](./recipes.md) схемы названы по имени  
(`MoodSliceSchema`), чтобы не забивать логику шумом. Здесь — **как их писать**.

SDK принимает `z.ZodType<…>` в:

| Место | Поле |
|-------|------|
| `state` | `schema` |
| `state.ops.*` | `payload` (опционально) |
| `seed` | `parse` (опционально) |
| `config` | `schema` |
| `ai.tasks.*` | `input`, `output` |
| `ai.tools.*` | `args`, `result?` |

Зависимость: `zod` (как в эталонных модулях репо).

---

## 1. Slice: базовый шаблон

Каждый slice **должен** нести версию схемы (для сейвов и migrations):

```ts
import { z } from "zod";

export const MoodSliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    level: z.number().int(),
  })
  .strict();

export type MoodSlice = z.infer<typeof MoodSliceSchema>;

export function createEmptyMoodSlice(): MoodSlice {
  return { schemaVersion: 1, level: 0 };
}
```

В `defineModule`:

```ts
state: {
  schema: MoodSliceSchema,
  initial: createEmptyMoodSlice(),
  // …
}
```

`.strict()` — лишние ключи в сейве/op не проглотятся молча (предпочтительный стиль репо).

---

## 2. Payload op

Два стиля ops — оба валидны.

### Короткий (без schema payload)

```ts
ops: {
  bump: (s: MoodSlice, p: { by?: number }) => ({
    ...s,
    level: s.level + (Number(p.by) || 1),
  }),
}
```

### С валидацией payload

```ts
export const BumpPayloadSchema = z
  .object({
    by: z.number().int().optional(),
  })
  .strict();

ops: {
  bump: {
    payload: BumpPayloadSchema,
    apply: (s, p) => ({
      ...s,
      level: s.level + (p.by ?? 1),
    }),
  },
}
```

Для seed-op часто отдельная schema:

```ts
export const SeedLorePayloadSchema = z
  .object({
    text: z.string().min(1).max(8_000),
  })
  .strict();
```

---

## 3. Meta для `seed.parse`

```ts
// meta.lore: string
export const LoreMetaSchema = z.string().min(1);

// meta.character: object
export const StoryCharacterSchema = z
  .object({
    name: z.string().min(1),
    appearance: z.string(),
    features: z.string(),
    outfit: z.string(),
  })
  .strict();

export type StoryCharacter = z.infer<typeof StoryCharacterSchema>;
```

```ts
seed: {
  fromMeta: "character",
  parse: StoryCharacterSchema,
  apply: (value, ctx) => {
    const c = value as StoryCharacter;
    ctx.op("seed", { /* поля */ });
  },
}
```

---

## 4. Config

```ts
export const WorkingMemoryConfigSchema = z
  .object({
    windowPairs: z.number().int().positive(),
  })
  .strict();

export type WorkingMemoryConfig = z.infer<typeof WorkingMemoryConfigSchema>;
```

```ts
config: {
  key: "working_memory",
  schema: WorkingMemoryConfigSchema,
  defaults: { windowPairs: 8 },
}
```

> В текущих модулях иногда встречается приведение  
> `schema as unknown as z.ZodType<JsonObject>` — это стык generic’ов sdk/contracts,  
> не «особая магия» Zod. Логика схемы обычная.

---

## 5. AI: task input/output и tool args

```ts
export const OutfitSyncInputSchema = z
  .object({
    sourceTurnId: z.string(),
    userText: z.string(),
    prose: z.string(),
    characterBefore: z.object({
      name: z.string(),
      appearance: z.string(),
      features: z.string(),
      outfit: z.string(),
    }),
  })
  .strict();

export const OutfitSyncOutputSchema = z
  .object({
    changed: z.boolean(),
    // …
  })
  .strict();

export const UpdateOutfitArgsSchema = z
  .object({
    outfit: z.string().min(1),
  })
  .strict();

export const UpdateOutfitResultSchema = z
  .object({
    ok: z.literal(true),
    outfit: z.string(),
  })
  .strict();
```

```ts
ai: {
  tasks: {
    outfit_sync: {
      input: OutfitSyncInputSchema,
      output: OutfitSyncOutputSchema,
      // …
    },
  },
  tools: {
    update_outfit: {
      args: UpdateOutfitArgsSchema,
      result: UpdateOutfitResultSchema,
      // при необходимости явный JSON Schema для провайдера:
      parametersJsonSchema: { /* … */ },
      handler(args, ctx) { /* … */ },
    },
  },
}
```

`parametersJsonSchema` — опциональный escape hatch, если автоконвертации Zod → JSON Schema недостаточно для конкретного LLM-провайдера.

---

## 6. Migrations

Если меняется форма slice:

```ts
state: {
  schema: MoodSliceSchemaV2,
  initial: createEmptyMoodV2(),
  migrations: {
    // from schemaVersion 1 → current
    1: (old) => {
      const o = old as { schemaVersion: 1; level: number };
      return {
        schemaVersion: 2 as const,
        level: o.level,
        moodLabel: o.level > 5 ? "high" : "low",
      };
    },
  },
  ops: { /* … */ },
}
```

Держи `schemaVersion` **внутри** данных slice согласованным с миграциями.

---

## 7. Где жить файлам

Рекомендуемый layout (как в product-модулях):

```text
packages/modules/mood/
  src/
    index.ts      ← defineModule, логика
    schema.ts     ← Zod + types + empty factories
    config.ts     ← optional config schema
    constants.ts  ← MODULE_ID, slice name, reasons
```

В `index.ts` импортируй схемы — не раздувай `defineModule` inline-Zod на десятки строк.

---

## 8. Мини-чеклист схемы

- [ ] `schemaVersion` в object slice  
- [ ] `.strict()` на object’ах сейва/payload  
- [ ] `z.infer<typeof X>` для типов  
- [ ] `initial` / `createEmpty*` проходит schema  
- [ ] payload op и seed meta покрыты, если данные снаружи  
- [ ] AI input/output — **JSON object** (не z.string() корень task input)

---

## См. также

- [sdk-reference.md](./sdk-reference.md) — где какая schema используется  
- [recipes.md](./recipes.md) — логика без Zod  
- Эталоны: `packages/modules/*/src/schema.ts`
