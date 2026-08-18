# `@rpengineext/create-module`

Scaffold нового product-модуля на `@rpengineext/module-sdk`.

## Usage

```bash
# из корня monorepo
bun run create-module mood
bun run create-module lore --recipe seed-narrative
```

**Recipes:** `state` | `seed-narrative` | `guard` | `full`

## После генерации

1. `bun install`
2. `bun test packages/modules/<id>`
3. Править `src/index.ts`
4. Подключить фабрику в host (`host-bootstrap`)

**Доки:** [`docs/modules/README.md`](../../docs/modules/README.md) · [sdk-reference](../../docs/modules/sdk-reference.md) · [recipes](../../docs/modules/recipes.md)
