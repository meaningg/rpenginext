# Как писать модули

Документ перенесён и упрощён.

## → [README.md](./README.md)

Там пошагово:

1. Scaffold (`bun run create-module`)  
2. Минимальный `defineModule`  
3. Тесты  
4. Подключение к host  
5. Рецепты: seed, memory, guard, config, AI  

Шаблон: [_template.md](./_template.md)  
Пакет: [`@rpengineext/module-sdk`](../../packages/module-sdk/README.md)  
Решение: [ADR 0004](../adr/0004-module-sdk-cbmd.md)

### Эталоны

- `packages/modules/world-canon`  
- `packages/modules/working-memory`  
- `packages/modules/character`  

### Не для авторов

- [architecture/12-extension-surface.md](../architecture/12-extension-surface.md) — ports core  
- [ADR 0005](../adr/0005-moments-native-core.md) — future core  
