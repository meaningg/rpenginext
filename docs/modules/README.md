# Modules — documentation index

> Для независимых авторов. Core менять не нужно.

## Главный гайд

### → [writing-modules-for-core.md](./writing-modules-for-core.md)

Практическое описание: манифест, permissions, catalogs/interceptors/ports, state commands, agents/tools, tests, полный пример на **текущем** API core.

## Остальное

| Файл | Содержание |
|------|------------|
| [writing-modules-for-core.md](./writing-modules-for-core.md) | **Как писать модули** (start here) |
| [_template.md](./_template.md) | Заготовка manifest + factory + tests |
| [../architecture/03-module-system.md](../architecture/03-module-system.md) | Норматив: lifecycle, permissions, packaging |
| [../architecture/12-extension-surface.md](../architecture/12-extension-surface.md) | Freeze поверхности A/B/C |
| [../architecture/04-state-and-commands.md](../architecture/04-state-and-commands.md) | Команды и atomic turns |
| [../architecture/06-turn-pipeline.md](../architecture/06-turn-pipeline.md) | Стадии хода |

## 30-second mental model

You do **not** write the game loop.

You register handlers inside fixed stages:

- reject illegal actions (`Guard`);
- plan / ask agents (`Planner`, `AgentTaskContributor`);
- propose state changes (`TransitionContributor` → `StateCommand[]`);
- feed the narrator (`NarrativeContextProvider`);
- suggest choices (`ChoiceContributor`);
- observe-only after success (`AfterCommitHook`).

World changes = **commands only**. Turns are **full-atomic**.

## Quick checklist

- [ ] Unique `id`, semver, `engines.core` / `engines.contracts`
- [ ] Least-privilege `permissions`
- [ ] `registers` / `contributes` / `interceptors` match real `register*` / `add*` calls (`strictManifest`)
- [ ] Slice + commands + migrations documented
- [ ] No direct LLM SDK; no `@rpengineext/core` internals
- [ ] Tests via `@rpengineext/core/testing` — success / reject / edge
- [ ] Module README: player-visible effects + author notes
