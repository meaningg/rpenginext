# Как писать модули

Документация разбита на несколько файлов (reference-first).

## Старт

→ **[README.md](./README.md)** — 5 минут, scaffold, чеклист

## Понять весь SDK

→ **[sdk-reference.md](./sdk-reference.md)** — capabilities, `ctx`, lifecycle, запреты

## Паттерны

→ **[recipes.md](./recipes.md)** — seed, memory, guard, config, AI, …

## Схемы

→ **[schemas.md](./schemas.md)** — Zod для state/config/AI

## Прочее

- Шаблон: [_template.md](./_template.md)  
- Пакет: [`@rpengineext/module-sdk`](../../packages/module-sdk/README.md)  
- Решение: [ADR 0004](../adr/0004-module-sdk-cbmd.md)

### Эталоны

- `packages/modules/world-canon`  
- `packages/modules/working-memory`  
- `packages/modules/character`  

### Не для авторов

- [architecture/12-extension-surface.md](../architecture/12-extension-surface.md) — ports core  
- [ADR 0005](../adr/0005-moments-native-core.md) — future core  
