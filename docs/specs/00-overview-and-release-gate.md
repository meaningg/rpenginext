# Spec 00 — Overview & Production Release Gate (Module Platform 1.0)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Priority** | foundation |
| **Depends on** | — |
| **Blocks** | all other specs (definition of done) |
| **Owner area** | docs + process |
| **Release mode** | **production only** — no MVP tag |

## 1. Goal

Зафиксировать, что такое **production** Module Platform 1.0 и когда можно честно сказать:

> Платформа готова к десяткам модулей в бою: contract locked, composition/ops/data/CI — production-grade, core не трогают под gameplay.

## 2. Problem

- Core + SDK + 3 first-party модуля уже «работают» как vertical slice.
- Для production multi-module product не хватает: freeze 1.0, multi-module CI, host composition, author errors, migrations, inter-module contracts, единый release gate.
- Риск: назвать 0.x «1.0» с half-DoD — сломать доверие авторов и сейвы.

## 3. Definition: Module Platform 1.0 (production)

**Platform 1.0** = shipped, supported surface:

| Layer | Must be production-ready |
|-------|--------------------------|
| Runtime | atomic turns, permissions, system turns, persistence, traces, cross-module events |
| Author SDK | `defineModule` 1.0.0 frozen + compatibility policy |
| Host | profile/env wiring, strict caps, module inventory CLI+API |
| Data | multi-slice save/load + slice migrations path proven |
| Quality | harness, stress≥30, atomicity pack, e2e mock, smoke |
| Docs | normative sdk-reference, errors, conventions, release notes |

```text
новый модуль = defineModule + harness-тесты + wire в host (profile/extra)
PR в packages/core не нужен (кроме bugfix / ADR / spec-required mechanism)
```

**Не включает как content:** npc, plot, combat, summarizer (отдельные product tasks после tag).

## 4. Invariants (нельзя ослаблять никогда в 1.x)

1. Full-atomic turns (commit all or rollback).
2. AI non-authoritative (tools/tasks → op proposals only).
3. Module writes **only** own slice via ops/commands.
4. Single author path: `@rpengineext/module-sdk` / `defineModule`.
5. Authors **no** runtime dependency on core internals.
6. `committed` cannot mutate world (observe + `scheduleSystem` only).
7. Default host profile: **fail on missing capability** (strict).
8. Stable failure `code` for author-facing misconfig (spec 03).
9. Events are turn-outcome notifications: `ctx.emit` only in `committed` / `rejected`; handlers observe-only (fail-loud); events never mutate the world.
10. Lifecycle hooks optional: `init` does not write the world (fail-loud); `shutdown` is cleanup only.
11. IR/manifest — **fully serializable protocol**: no functions/closures/zod instances in IR (schema validation lives in SDK bindings; optional portable schema descriptors, e.g. JSON Schema, only). Author-surface semantics (spec 01) are language-agnostic: any SDK — TS/JS in 1.0, foreign languages post-1.0 — emits the same IR and passes the same engines validation.

## 5. Anti-scope (не делать в этом workstream)

| Non-goal | Why |
|----------|-----|
| ADR 0005 moments-native core | internal cleanup; authors already on moments |
| Product domain modules as platform deliverable | separate tasks after tag |
| Raw ports / interceptors as author API | breaks ADR 0004 |
| Marketplace / remote plugin download | security + product later |
| Author UI / web extension surface (module-defined screens, components, commands) | module system is **backend-only by design**; apps consume engine API (narrative output, host status, readModels, events) |
| Foreign-language SDK as 1.0 deliverable (Python и др.) | 1.0 шипится на TS/JS `module-sdk`; polyglot SDK + remote module driver — post-1.0 (§5 backlog, invariant 11) |
| Multiplayer simultaneous turns | different architecture |
| Content-safety product hooks | optional later; not platform core |
| Pipeline rewrite “for beauty” | risk without author win |
| **MVP / “temporary 1.0” tag** | **forbidden** |

### Explicit post-1.0 backlog (not cuts — deferred by design)

- ADR 0005 (moments-native core; until then sdk↔ports dual-path — compat+stress mandatory on every sdk/core change)
- `turn.plan` / advanced plan extras (spec 06 item A)
- `rules.costs`, structured action kinds beyond free_text
- Dynamic event subscriptions / event filters (spec 06 §3)
- Versioned capability tokens (spec 06 §5.1)
- Polyglot SDK (Python и др.): foreign-language SDK = второй producer того же IR (invariant 11) + remote module driver на host-уровне (IPC, batch-per-moment, timeouts, kill); не author surface, не создаёт «третьего пути» в core — modules land через те же IR bind + engines validation
- Live-LLM as release blocker (optional CI job only)
- npm public marketplace

## 6. Workstreams (all required)

| ID | Spec | Summary |
|----|------|---------|
| 01 | [01-sdk-contract-freeze.md](./01-sdk-contract-freeze.md) | Freeze + compatibility |
| 02 | [02-testing-harness-stress-ci.md](./02-testing-harness-stress-ci.md) | Harness / stress / platform |
| 03 | [03-author-errors.md](./03-author-errors.md) | Stable author errors |
| 04 | [04-host-composition.md](./04-host-composition.md) | Host profiles + ops surface |
| 05 | [05-scaffold-and-migrations.md](./05-scaffold-and-migrations.md) | Scaffold + migrations |
| 06 | [06-inter-module-and-sdk-gaps.md](./06-inter-module-and-sdk-gaps.md) | Boundaries + readModel + events + lifecycle |
| 07 | [07-release-and-versioning.md](./07-release-and-versioning.md) | Tag gate |

## 7. Sprint order (delivery, not quality tiers)

| Sprint | Focus | Specs | Outcome |
|--------|--------|-------|---------|
| **S1** | Harness + errors + atomicity | 02, 03 | authors test uniformly; misconfig is clear |
| **S2** | Stress + freeze draft | 02, 01 | multi-module hell caught; contract drafting |
| **S3** | Host composition production | 04 | env/profile/CLI/API; strict default |
| **S4** | Scaffold + migrations | 05 | all recipes + migrate proven |
| **S5** | Inter-module + readModel + events | 06 | safe composition at scale |
| **S6** | 1.0 stamp + freeze + gate | 01 final, 07 | **production tag** |

Parallel: docs inside sprints; S3 ∥ late S2 docs.  
**Do not** stamp 1.0 until **all** specs 01–06 are `done`.

## 8. Production Release DoD (hard gate)

Tag **запрещён**, пока не выполнено **всё** ниже.

### 8.1 Author path
- [ ] Единственный author path: `defineModule` / module-sdk
- [ ] Author tests SoT: `@rpengineext/module-sdk/test` (harness); `createTestEngine` = advanced/maintainer escape only
- [ ] `bun run create-module` → package + **все** recipes из spec 05 + ≥3 harness tests each
- [ ] Runtime dep модуля: `module-sdk` + `zod` only (+ contracts only if re-exported/needed types — prefer sdk)
- [ ] `core` — devDependency for tests only
- [ ] Author docs **не** требуют `12-extension-surface.md`
- [ ] Moments permissions locked: `committed` cannot mutate; `ctx.op` there **fail-loud** (not silent drop) — spec 03 E15
- [ ] `ctx.readModel` shipped; unknown name → stable `MODULE_READ_MODEL_UNKNOWN` (fail loud, all moments) — spec 06
- [ ] `ctx.emit` + `events` capability normative: emit post-outcome only; handlers observe-only (fail-loud) — spec 06
- [ ] Lifecycle `init`/`shutdown`: init failure → boot fail `MODULE_INIT_FAILED`; shutdown error → warning

### 8.2 Stability & CI
- [ ] IR/manifest JSON round-trip in compat fixtures (serializable, no closures) — polyglot-readiness lock
- [ ] `bun run typecheck` green (workspace)
- [ ] `bun run test:compat` green
- [ ] `bun run test:modules-stress` green (N≥30, cases S01–S12 per spec 02)
- [ ] `bun run test:platform` green
- [ ] `bun run test:e2e` green (mock)
- [ ] `bun run smoke:play:mock` green
- [ ] `bun run test:module-boundaries` green (spec 06)

### 8.3 Host / ops
- [ ] Profiles + env + `extraModules` + full `modules` override
- [ ] Default = current core-book behavior **and** strict capabilities ON
- [ ] Duplicate id/slice → fail boot (stable code + module ids in message)
- [ ] Missing `requires` → fail boot on default host
- [ ] `listModules` on runtime
- [ ] Module list via **CLI and API**
- [ ] Structured boot log of loaded modules

### 8.4 Lifecycle / data
- [ ] Multi-slice save/load roundtrip under stress
- [ ] Background system turn + tool `proposeOp` covered by harness (**scripted tool LLM**)
- [ ] Slice **migrations** documented + automated v1→v2 load test (no “defer”)
- [ ] Journal replay / atomicity pack A01–A09 green (spec 02)
- [ ] Pending scheduled system turns survive save/load and drain after load (spec 02 S19)

### 8.5 Inter-module
- [ ] No `module-*` → `module-*` runtime deps (CI)
- [ ] Public contract section on all first-party module READMEs
- [ ] `ctx.readModel` shipped, documented, tested (spec 06 D)
- [ ] Unknown `readModel` name locked to `MODULE_READ_MODEL_UNKNOWN` (no silent undefined)
- [ ] readModel providing norms documented (namespacing, args schema, MAJOR-break rule) — spec 06 §6.5
- [ ] Events: duplicate/unknown event names fail boot (stable codes); handler errors post-commit → warning (never silent); no module→module deps via events
- [ ] conventions.md published

### 8.6 Contract / release artifacts
- [ ] `MODULE_SDK_VERSION = 1.0.0` (+ aligned contracts/core/modules/host-bootstrap)
- [ ] `docs/modules/compatibility.md` + `CHANGELOG.md` + `errors.md`
- [ ] sdk-reference header **Normative SDK 1.0**
- [ ] `docs/releases/module-platform-1.0.md`
- [ ] Roadmap Phase 4.5 complete; post-1.0 backlog explicit
- [ ] Post-release core-change rule published

## 9. Operational criterion (after release)

```text
1. create-module <id> --recipe <…>
2. defineModule (…)
3. tests via @rpengineext/module-sdk/test
4. public contract in README (provides/requires/readModels/events/…)
5. wire: profile / RP_MODULES / extraModules
6. bun test + CI (compat, stress, boundaries)
7. NO packages/core change
```

**Alarm:** core touch for >1 of 5 new modules → surface gap; fix SDK (minor), не костыль в pipeline.

## 10. Metrics (production health)

| Metric | Healthy |
|--------|---------|
| Core PRs / month after tag | mostly bugfix / ADR |
| Time to first green module test | &lt; 1 hour |
| Modules needing core change | ~0 |
| Boot conflict | deterministic fail + stable code |
| Save upgrade across module minor | migrations path works |

## 11. Implementation checklist (this spec)

- [x] Specs index + 00–07 written
- [x] Linked from roadmap / README / overview / modules README
- [x] MVP dual-track removed — production-only gate
- [x] Child specs marked `done` as completed
- [ ] §8 checkboxes claimed in release PR (verification block below green: typecheck, compat, stress, boundaries, platform, e2e, smoke)
- [ ] Tag cut per spec 07 (`Module Platform 1.0`)

## 12. Verification

| Check | How |
|-------|-----|
| No MVP escape hatches | grep specs for `MVP` / `minimal wiring` / `or defer` — only allowed in explicit post-1.0 backlog |
| Gate testable | every §8 item maps to command or artifact in 01–07 |
| Anti-scope | no PRs for marketplace/ADR0005-as-blocker under this workstream |

```bash
bun run typecheck
bun run test:compat
bun run test:modules-stress
bun run test:module-boundaries
bun run test:platform
bun run test:e2e
bun run smoke:play:mock
```

## 13. Exit

Spec 00 → `done` only when Module Platform **1.0 production** is tagged per spec 07 and §8 is fully checked.
