# Specs — Module Platform 1.0 (Production)

> **Статус:** **done** — Module Platform 1.0 shipped (production tag per spec 07).
> **Режим релиза:** **один** — полноценный production Platform 1.0.
> **Запрещено:** ship «MVP-урезанный 1.0», half-DoD, «потом допилим».
> **Не цель workstream:** domain-модули (npc/plot/combat) как content — они **после** platform tag.

## 1. Цель

Production-ready платформа, на которой:

1. пишутся **десятки** независимых модулей;
2. core **не** правят под gameplay;
3. author contract (`defineModule`) **заморожен** semver 1.x;
4. composition, save/load, migrations, errors, CI — **боевые**, не «для демо».

## 2. Карта спек (все обязательны для tag)

| Spec | Тема | Gate | Status |
|------|------|------|--------|
| [00-overview-and-release-gate.md](./00-overview-and-release-gate.md) | Обзор, production DoD, anti-scope, спринты | foundation | `done` |
| [01-sdk-contract-freeze.md](./01-sdk-contract-freeze.md) | Freeze SDK / moments / compatibility policy | required | `done` |
| [02-testing-harness-stress-ci.md](./02-testing-harness-stress-ci.md) | Harness, stress, atomicity, `test:platform` | required | `done` |
| [03-author-errors.md](./03-author-errors.md) | Стабильные author-facing errors | required | `done` |
| [04-host-composition.md](./04-host-composition.md) | Profiles, env, CLI+API module list | required | `done` |
| [05-scaffold-and-migrations.md](./05-scaffold-and-migrations.md) | Все recipes + migrations + CI scaffold | required | `done` |
| [06-inter-module-and-sdk-gaps.md](./06-inter-module-and-sdk-gaps.md) | Boundaries, strict requires, `ctx.readModel`, events, lifecycle | required | `done` |
| [07-release-and-versioning.md](./07-release-and-versioning.md) | 1.0 stamp, docs freeze, release gate | required | `done` |

Связанное:

- Author: [`docs/modules/README.md`](../modules/README.md), [`sdk-reference.md`](../modules/sdk-reference.md)
- ADR: [0004](../adr/0004-module-sdk-cbmd.md), [0005 deferred](../adr/0005-moments-native-core.md)

## 3. Правила работ

1. PR ссылается на spec id (`specs/02`, …).
2. **DoD спеки = must**, не wishlist. Нет checkbox «or defer for MVP».
3. Core меняется только: bugfix / spec-required wiring / ADR.
4. Domain modules — отдельные задачи **после** platform 1.0 (кроме fixture-модулей внутри тестов).
5. Сознательный post-1.0 backlog (ADR 0005, `turn.plan`, marketplace, multiplayer) — только в §Deferred каждой спеки / release notes, **не** маскируется под «MVP cut».
6. Open semantics в normative freeze **запрещены** — решения lock’аются в спеке до кода (`readModel` errors, host precedence, committed op).

## 4. Production bar (кратко)

| Область | Bar |
|---------|-----|
| Author API | SDK 1.0 frozen; один path; harness = author test SoT |
| Moments | write-forbidden moments fail-loud on `ctx.op` (E15); no silent-drop |
| Tests | harness + stress N≥30 **noop** modules + S01–S22 + atomicity + first-party + e2e mock + smoke |
| Host | profiles + env + extraModules; strict capabilities default ON; precedence matrix locked |
| Data | multi-slice save/load + schema migrations tested |
| Ops | list modules CLI **и** API; structured boot log; stable error codes E01–E26 |
| Inter-module | no module→module deps; `provides`/`requires`; `ctx.readModel` fail-loud unknown; `events` emit/subscribe post-outcome; lifecycle `init`/`shutdown` |
| Release | versions 1.0.0 aligned; compatibility.md; release notes; dual-path risk explicit until ADR 0005 |

## 5. Статусы спек

| Status | Meaning |
|--------|---------|
| `draft` | уточняется (не для coding без review) |
| `ready` | можно имплементировать |
| `in_progress` | в работе |
| `done` | **полный** DoD + verification green |
| `deferred` | **только** explicit post-1.0 items (не half-spec) |
