# Spec 07 — Production Release: Versioning, Docs Freeze & Platform 1.0 Tag

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Priority** | P3 final gate |
| **Depends on** | **All** specs 01–06 `done` (no partial set) |
| **Blocks** | public claim “Module Platform 1.0” |
| **Owner area** | versions, CI, docs, roadmap, release notes |
| **Release mode** | **production tag only** |

## 1. Goal

Выпустить **Module Platform 1.0** как воспроизводимый production release:

- aligned 1.0.0 versions;
- frozen author docs;
- hard CI gate;
- release notes + explicit deferred backlog;
- post-release operating rules.

## 2. Scope

### In scope (required)
- Version matrix bump to 1.0.0
- Constants (`MODULE_SDK_VERSION`, `CORE_VERSION`, `CONTRACTS_VERSION`, engines)
- Scripts: `test:platform`, `test:modules-stress`, `test:module-boundaries`, `test:scaffold-smoke`
- Full verification command sequence green
- Docs freeze list
- `docs/releases/module-platform-1.0.md`
- Roadmap Phase 4.5 complete
- Perf smoke (from spec 02 P01–P02) included in gate
- Post-release rules in principles or compatibility.md

### Out of scope
- Public npm marketplace
- Marketing site
- Implementing ADR 0005 / turn.plan as part of tag
- Live LLM as blocker

## 3. Preconditions (hard)

Tag is **illegal** unless:

1. Specs 01, 02, 03, 04, 05, 06 status = `done`  
2. Spec 00 §8 Production Release DoD checkboxes all claimed in release PR  
3. No open “MVP subset” language left in specs as active escape hatches  

## 4. Version matrix (required)

| Package | Version |
|---------|---------|
| `@rpengineext/module-sdk` | **1.0.0** |
| `@rpengineext/contracts` | **1.0.0** |
| `@rpengineext/core` | **1.0.0** |
| `@rpengineext/module-working-memory` | **1.0.0** |
| `@rpengineext/module-character` | **1.0.0** |
| `@rpengineext/module-world-canon` | **1.0.0** |
| `@rpengineext/host-bootstrap` | **1.0.0** |
| `@rpengineext/create-module` | **1.0.0** |
| `@rpengineext/persistence-sqlite` | **1.0.0** |
| `@rpengineext/agents-responses` | **1.0.0** |
| `@rpengineext/logger` | **1.0.0** (if versioned with platform) |
| `@rpengineext/content-stories` | **1.0.0** |
| apps `api` / `cli` / `web` | **1.0.0** app versions aligned or documented |

Constants:

- `MODULE_SDK_VERSION = "1.0.0"`
- `SDK_ENGINES_CORE` / `SDK_ENGINES_CONTRACTS` → `^1.0.0`
- `CORE_VERSION` / `CONTRACTS_VERSION` → `1.0.0`

## 5. CI / scripts (normative)

| Script | Required |
|--------|----------|
| `typecheck` | yes |
| `test:compat` | yes |
| `test:modules-stress` | yes |
| `test:module-boundaries` | yes |
| `test:scaffold-smoke` | yes |
| `test:platform` | yes — must include compat, stress, core atomicity, first-party modules; may invoke boundaries/scaffold or gate runs them separately |
| `test:e2e` | yes (mock) |
| `smoke:play:mock` | yes |
| `test:e2e:live` | optional job only |

### Release verification sequence (all must pass)

```bash
bun run typecheck
bun run test:compat
bun run test:modules-stress
bun run test:module-boundaries
bun run test:scaffold-smoke
bun run test:platform
bun run test:e2e
bun run smoke:play:mock
```

Document this block in root README and this spec.

## 6. Docs freeze checklist (all required)

| Doc | Action |
|-----|--------|
| `docs/modules/sdk-reference.md` | **Normative SDK 1.0**; ctx includes readModel + events; lifecycle hooks |
| `docs/modules/compatibility.md` | final |
| `docs/modules/CHANGELOG.md` | `## 1.0.0` |
| `docs/modules/errors.md` | final catalog (E01–E26) |
| `docs/modules/conventions.md` | inter-module + events + priority |
| `docs/modules/README.md` | platform locked + links |
| `docs/modules/recipes.md` | all recipes + migrations |
| `docs/releases/module-platform-1.0.md` | release notes |
| `docs/specs/README.md` | statuses → done |
| `docs/architecture/09-testing.md` | all scripts |
| `docs/architecture/08-configuration.md` | module env/profile |
| `docs/architecture/01-principles.md` or compatibility | post-release core-change rule |
| Root `README.md` | production platform status |
| ADR 0004 | frozen 1.0 note |
| ADR 0005 | still deferred |

Author path must not teach ports.

## 7. Release notes (required template)

`docs/releases/module-platform-1.0.md`:

1. **What shipped** — SDK 1.0, harness, stress, host composition, migrations, readModel, errors, CI gates, **events (push-уведомления), module lifecycle (init/shutdown)**  
2. **Author workflow** — link modules README  
3. **Compatibility promise** — link compatibility.md  
4. **Breaking vs 0.x** — explicit list  
5. **Deferred by design**
   - ADR 0005 moments-native core  
   - Until ADR 0005: **sdk IR bind ↔ ports bus dual-path** remains; every sdk/core PR **must** keep `test:compat` + `test:modules-stress` green (dual-path regression risk)  
   - ADR 0005 target: MomentRegistry ключуется нормативной моментной таблицей spec 01 §4.2; поверхности 1.0 (events dispatch, lifecycle) реализуются момент-нативно (spec 06 §7.4) — миграция = перенос старых портов под полными гейтами (compat + stress + platform), без переделки новых поверхностей  
   - `turn.plan` (spec 06 A)  
   - costs / structured actions author API
   - dynamic event subscriptions / event filters
   - versioned capability tokens
   - domain modules npc/plot/…  
   - marketplace, multiplayer, content-safety product  
   - live LLM CI blocker  
6. **Ops** — env vars, GET /modules, strict capabilities  
7. **Post-release rule** — core PR only bugfix / ADR / “cannot express in SDK” proof  
8. **Events/lifecycle additivity** — new event / new optional hook = **minor**; change to dispatch semantics, moment permissions, or hook ctx rules = **major** (spec 01 §5.2)  

## 8. Implementation checklist

- [ ] Confirm 01–06 `done`
- [ ] Bump version matrix + constants
- [ ] Ensure all scripts exist and are documented
- [ ] Run full verification sequence
- [ ] Docs freeze list
- [ ] Write release notes
- [ ] Update roadmap + specs statuses
- [ ] Spec 00 §8 checked in PR body
- [ ] Tag / merge message: `Module Platform 1.0`
- [ ] Post-release rules published

## 9. DoD (production — all required)

- [ ] Preconditions §3 true
- [ ] Versions/constants 1.0.0 aligned
- [ ] Full verification sequence §5 green
- [ ] Docs freeze §6 complete
- [ ] Release notes §7 published with deferred list including turn.plan + ADR 0005
- [ ] Spec index all platform specs `done`
- [ ] Roadmap shows platform complete; product modules next
- [ ] No active MVP dual-track language in specs

## 10. Verification

```bash
bun run typecheck
bun run test:compat
bun run test:modules-stress
bun run test:module-boundaries
bun run test:scaffold-smoke
bun run test:platform
bun run test:e2e
bun run smoke:play:mock
```

Manual:

| Check | Pass |
|-------|------|
| New contributor path | README → modules → create-module → tests |
| GET /modules | works on api:mock |
| Core policy | written and linked |
| Versions | package.json + constants match |

## 11. Post-release operating rules (normative)

1. Additive optional SDK API = **minor**; run compat + stress + boundaries.  
2. Author-breaking change = **major** + migration notes + CHANGELOG.  
3. Core change requires: bugfix **or** ADR **or** written proof not expressible in SDK.  
4. Each product module: own task; harness tests; no core drive-by.  
5. ADR 0005 / turn.plan only on documented triggers — not drive-by refactors.  
6. Never re-introduce MVP tags for broken half-platforms.  
7. Until moments-native core: treat sdk↔ports adapter as **load-bearing**; no “quick” bind bypass without compat fixtures.
8. Events/lifecycle: additive surface (new event, new optional hook) = **minor** + compat/stress/boundaries gates; changing dispatch semantics / moment permissions / hook ctx rules = **major** (spec 01 §5.2).
9. Author-facing docs must keep teaching **harness + defineModule only** (no ports, no pipeline stages as author API).

## 12. Exit

Spec **done** when §9 satisfied and Module Platform 1.0 is tagged/merged with release notes.

---

## Appendix — Gate coverage map (production)

| Area | Spec | Gate evidence |
|------|------|----------------|
| SDK freeze | 01 | compatibility.md, VERSION 1.0.0, test:compat |
| Harness/stress/atomicity | 02 | test:modules-stress, test:platform |
| Errors | 03 | errors.md, E01–E14 tests |
| Host ops | 04 | host-bootstrap tests, GET /modules, env |
| Scaffold/migrations | 05 | test:scaffold-smoke, migrate tests |
| Inter-module + readModel + events | 06 | test:module-boundaries, readModel + events tests |
| Tag | 07 | this checklist + release notes |
