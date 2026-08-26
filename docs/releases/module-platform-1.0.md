# Module Platform 1.0 — Release Notes

> **Module Platform 1.0 production tag.**  
> Date: 2026-08-26 · Specs 01–06 `done`, spec 00 §8 production DoD complete,
> full release gate green (spec 07 §5).

## 1. What shipped

- **SDK 1.0 frozen** — `@rpengineext/module-sdk` `1.0.0`:
  capability kinds `state | seed | rules | turn | narrative | ai | host | config | access | events`;
  single author path `defineModule`; нормативные моменты/права — sdk-reference.
- **Harness** — `@rpengineext/module-sdk/test`: `testModule`/`testModules`,
  save/load, background system turns, `fixedProseLlm`/`scriptedToolLlm`,
  asserts (spec 02).
- **Stress & atomicity** — S01–S22 + P01–P04 (N≥30/100, документарные bounds),
  A01–A09 (spec 02).
- **Stable author errors E01–E26** — `docs/modules/errors.md`, single source в
  contracts; fail-loud вместо silent-drop (spec 03).
- **Host composition** — profiles `core-book|minimal|none`, `RP_MODULES` /
  `RP_DISABLE_MODULES`, exclusive `modules` override, strict capabilities ON,
  `listModules()` + CLI `--modules` + API `GET /modules`, structured boot log
  (spec 04).
- **Scaffold & migrations** — 8 recipes (`state | seed-narrative | guard |
  full | ai-tool | access-read | migrate | events`), CI scaffold smoke,
  v1→v2 slice migration path + fail-loud unmigratable (spec 05).
- **readModel** — `ctx.readModel(name, args?)` fail-loud unknown
  (spec 06 §6).
- **Events** — push-уведомления между модулями: emit в post-outcome,
  observe-only подписчики, caps (spec 06 §7).
- **Module lifecycle** — `init`/`shutdown` с нормативными failure codes
  (spec 06 §8).
- **CI gates** — `test:compat`, `test:modules-stress`, `test:module-boundaries`,
  `test:scaffold-smoke`, `test:platform`, `test:e2e`, `smoke:play:mock`.

## 2. Author workflow

1. `bun run create-module <id> --recipe <name>`
2. `defineModule(...)` — код и схемы
3. тесты через `@rpengineext/module-sdk/test` (harness = SoT)
4. Public contract в README (provides/requires/readModels/events/…)
5. wire: profile / `RP_MODULES` / `extraModules`
6. `bun test` + CI (compat, stress, boundaries)
7. **NO** `packages/core` change

Начало: [docs/modules/README.md](../modules/README.md).

## 3. Compatibility promise

Модули на документированной поверхности 1.0.x работают на 1.y без изменений
кода. Полная политика: [docs/modules/compatibility.md](../modules/compatibility.md).

## 4. Breaking vs 0.x

- `ctx.op` в `committed`/write-forbidden моментах — fail-loud
  `MODULE_MOMENT_OP_FORBIDDEN` (было: тихий drop).
- unknown `readModel` — fail-loud (было: `undefined`).
- missing `requires` — boot fail (strict default).
- `ctx.emit` вне post-outcome — fail-loud.
- Тесты авторов: harness = SoT (`createTestEngine` — advanced escape).

## 5. Deferred by design (не MVP cuts)

- **ADR 0005** (moments-native core). До его реализации sdk IR bind ↔ ports
  bus **dual-path** остаётся load-bearing: каждый sdk/core PR **обязан**
  держать `test:compat` + `test:modules-stress` зелёными.
  Целевой MomentRegistry ключуется нормативной моментной таблицей
  (spec 01 §4.2); поверхности 1.0 (events dispatch, lifecycle) уже реализованы
  момент-нативно — миграция = перенос старых портов под полными гейтами,
  без переделки новых поверхностей (spec 06 §7.4, spec 07 §7).
- `turn.plan` (spec 06 Item A) — pre-outcome decision moment.
- costs / structured action kinds author API.
- dynamic event subscriptions / event filters.
- versioned capability tokens.
- domain modules npc/plot/combat как content (отдельные tasks после tag).
- marketplace, multiplayer, content-safety product hooks.
- live-LLM CI blocker (optional job `test:e2e:live`).

## 6. Ops

- Env: `RP_MODULE_PROFILE`, `RP_MODULES`, `RP_DISABLE_MODULES`
  ([08-configuration](../architecture/08-configuration.md)).
- `GET /modules` — inventory API; CLI `--modules` — inventory terminal.
- Strict capabilities ON по умолчанию; duplicate/unknown id — deterministic
  fail с stable code.

## 7. Post-release rules

1. Additive optional SDK API = **minor** — гейты compat + stress + boundaries.
2. Author-breaking = **major** + migration notes + CHANGELOG.
3. Core PR — только bugfix **или** ADR **или** письменное обоснование
   «не выражается в SDK».
4. Каждый product module — своя задача, harness-тесты, без core drive-by.
5. ADR 0005 / turn.plan — только по документированным триггерам.
6. Никогда не возвращать MVP-теги для половинчатых платформ.
7. До moments-native core sdk↔ports adapter — load-bearing; никаких
   «быстрых» bind bypass без compat-фикстур.
8. Events/lifecycle: новый event / новый optional hook = **minor**; изменение
   dispatch semantics / moment permissions / hook ctx rules = **major**
   (spec 01 §5.2).
9. Author-доки учат только **harness + defineModule** (никаких ports /
   pipeline stages как author API).

## 8. Post-release core-change rule (v1)

Core меняется только: bugfix / ADR / spec-required wiring / письменное
доказательство невозможности выразить в SDK (см. spec 00 §9).