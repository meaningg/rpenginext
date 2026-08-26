# Spec 01 — SDK Contract Freeze (Author Surface 1.0 Production)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Priority** | P0 (draft lock) + P3 (1.0 stamp with release) |
| **Depends on** | Spec 00 |
| **Blocks** | Spec 07 tag; additive rules for 05/06 |
| **Owner area** | `packages/module-sdk`, `docs/modules`, contracts IR |
| **Release mode** | production — incomplete freeze = **no tag** |

## 1. Goal

Author API **предсказуем, задокументирован и заморожен** как production 1.x:

- закрытый каталог capabilities/moments;
- semver + IR dual-load policy;
- запрет «тихого» break;
- авторы не зависят от ports/pipeline internals.

## 2. Current state

- `defineModule`, 9 capability kinds, IR + bind.
- `MODULE_SDK_VERSION = "0.1.0"`.
- Docs: sdk-reference, ADR 0004.
- Gaps: no published `compatibility.md`, no formal freeze stamp, 0.x trust model.

## 3. Scope

### In scope (all required)
- Normative freeze of capability kinds + fields for SDK 1.0
- Normative moments permission table
- Normative lock: `events` capability + lifecycle hooks (surface from spec 06 §7–§8)
- `docs/modules/compatibility.md` (full policy)
- `docs/modules/CHANGELOG.md` process + 1.0.0 entry at stamp
- Non-author API boundary in author docs
- Version constants path (stamp in spec 07)
- Compat CI as merge gate for sdk/core

### Out of scope
- New capabilities beyond what spec 06 **requires** for 1.0 (spec 06 requires: `readModel` ctx API, `events` capability kind, lifecycle hooks — all normative 1.0 surface)
- ADR 0005 moments-native core
- Gameplay changes in first-party modules

### Post-1.0 (explicit, not freeze debt)
- `turn.plan` moment (spec 06 A)
- costs / structured actions author API
- Dynamic event subscriptions / event filters (spec 06 §3)

## 4. Normative author surface (SDK 1.0)

### 4.1 Capability kinds (closed set for 1.0)

```text
state | seed | rules | turn | narrative | ai | host | config | access | events
```

Object sugar and `capabilities[]` normalize to one list.
Adding a **new kind** after 1.0.0 = **minor** only if optional + backward compatible; removing/renaming = **major**.
`events` = emit/subscribe declarations (spec 06 §7); lifecycle hooks `init`/`shutdown` are module-level, not a kind (§4.5).

**Language-agnostic contract:** semantics of this section (moments, ops, deny, readModel, events, lifecycle) are language-independent — любой SDK (TS/JS в 1.0; Python и др. — post-1.0, spec 00 backlog) эмитит один и тот же IR и проходит те же engines-валидации. Foreign-language SDK **не создаёт третьего пути** в core: модули попадают через те же IR bind + dual-load policy (§5.2).

### 4.2 Moments / lifecycle permissions (normative)

| Moment | `ctx.op` | `deny` | `scheduleSystem` | `passage` | `readModel` (06) | `emit` (events, 06) |
|--------|----------|--------|------------------|-----------|------------------|---------------------|
| `seed.apply` | yes | yes* | no | no | yes | no (fail-loud) |
| `rules.guard` | **no** (fail-loud if called) | **yes** | no | no | yes | no (fail-loud) |
| `rules.soft` | **no** (fail-loud) | no | no | no | yes | no (fail-loud) |
| `turn.change` | **yes** | yes | no | no | yes | no (fail-loud) |
| `narrative.*` | **no** (fail-loud) | no | no | no | yes | no (fail-loud) |
| `turn.afterProse` | **yes** | yes | no | **yes** | yes | no (fail-loud) |
| commit (core) | — | — | — | — | — | — |
| `turn.committed` | **no** (**fail-loud**, never silent-drop) | no | **yes** | yes (read) | yes | **yes** |
| `turn.rejected` | **no** (fail-loud) | no | no | no | yes | **yes** |
| `turn.load` | **no** (fail-loud) | — | no | no | yes | no (fail-loud) |
| `ai.tools.handler` | `proposeOp` only | yes | no | — | yes | no (fail-loud) |
| `rules.invariant` | **no** (fail-loud) | yes* | no | — | n/a | no (fail-loud) |
| `event.dispatch` | **no** (**fail-loud**) | **no** (**fail-loud**) | **yes** | no | yes | **yes** (capped) |

\* deny in apply/invariant rejects op or turn per core codes.

**`emit` outside post-outcome moments** (`committed` / `rejected` / `event.dispatch`) → fail-loud `MODULE_EVENT_EMIT_FORBIDDEN` (spec 03 E19): mid-turn violation rejects the turn; post-outcome violation surfaces as warning (spec 06 §7.3).

**`event.dispatch` is a write-forbidden moment:** any `ctx.op` → `MODULE_MOMENT_OP_FORBIDDEN` (E15), `deny()` → `MODULE_EVENT_DENY_FORBIDDEN` (E20), `emit` allowed but depth/burst capped (E22/E23).

**Write-forbidden moments:** any `ctx.op` / mutate attempt → stable `MODULE_MOMENT_OP_FORBIDDEN` (spec 03 E15). Silent collect-and-discard is **not** compliant.

**`readModel` unknown name:** fail loud with `MODULE_READ_MODEL_UNKNOWN` in **all** moments (including narrative). No silent `undefined` (spec 06).

**Changing this table or event dispatch semantics (spec 06 §7.3) = MAJOR** (document in compatibility.md).

### 4.3 Hard author rules

1. Write state only via `ctx.op` / `ctx.proposeOp` (and seed/apply ops) **and only in moments that allow writes**.
2. Turns are atomic.
3. Foreign slice: read only with `access.read` or via `readModel`; never write.
4. No direct LLM SDK — only `ai.tasks` / `ai.tools`.
5. `deny(code, message)` for rejection.
6. Runtime deps: `@rpengineext/module-sdk` + `zod` (not core internals).
7. `turn.committed` is observe + `scheduleSystem` only — mutate attempts fail loud.
8. `ctx.readModel(name)` either returns data or fails with stable code — never silent miss.
9. Emit events only in `turn.committed` / `turn.rejected` (player **or** system turns); payload validates against the declared schema; event handlers are observe-only (`ctx.op` / `deny` fail-loud) — follow-up work via `scheduleSystem`.
10. `init` must not touch world state (fail-loud); `shutdown` is cleanup only; both optional.

### 4.4 Explicit non-author API

Authors must not use:

- `ModuleRegisterContext` / raw `add*` / `register*`
- Stage interceptors
- Pipeline stage ids as extension API
- Deep imports `@rpengineext/core/src/...`

Maintainer-only: `docs/architecture/12-extension-surface.md`.

### 4.5 Lifecycle hooks (normative — details in spec 06 §8)

| Hook | When | ctx | Failure |
|------|------|-----|---------|
| `init` (optional) | once, после boot-валидации, до первого turn/seed | **no world access** (op / emit / deny / readModel → fail-loud) | **boot fail** `MODULE_INIT_FAILED` (E24) |
| `shutdown` (optional) | engine stop, **reverse priority** order | — (cleanup only) | warning `MODULE_SHUTDOWN_ERROR` (E25) |

## 5. Implementation

### 5.1 Documents (required artifacts)

| Artifact | Action |
|----------|--------|
| `docs/modules/compatibility.md` | **create** — full policy |
| `docs/modules/CHANGELOG.md` | **create** — kept current |
| `docs/modules/sdk-reference.md` | moments table (incl. `emit` column) + events section locked; header Normative 1.0 at stamp |
| `docs/modules/README.md` | link compatibility; “1.0 locked” at stamp |
| `packages/module-sdk/README.md` | version + freeze note |
| ADR 0004 | “Author path frozen at SDK 1.0” note at stamp |

### 5.2 `compatibility.md` required sections

1. **SDK semver**
   - MAJOR: remove/rename author API; change moment permissions **or event dispatch semantics**; IR break without dual-load; semantic break of merge/invariants
   - MINOR: additive optional fields/kinds; new test helpers; new recipes
   - PATCH: docs; non-API bugfix
2. **IR (`MODULE_IR_VERSION`)**
   - On IR shape break: bump version; **support N and N-1 loaders for at least one release cycle** (or document hard cut with major + migration guide)
   - **IR must stay fully serializable (JSON)** — no functions/closures/zod instances (schema validation lives in SDK bindings); optional portable schema descriptors (JSON Schema) only. Hard invariant — foreign-language SDKs (post-1.0) are second producers of the same IR.
3. **engines.core / engines.contracts** stamped by sdk; boot validates ranges
4. **Author dependency rules**
5. **How to propose additive API** (process + tests: compat + stress)
6. **CI gates:** `test:compat` required on every sdk/core change
7. **Stability promise:** modules written against 1.0.x keep working on 1.y without source change if they used only documented API

### 5.3 Code touchpoints

| Path | Change |
|------|--------|
| `packages/module-sdk/src/version.ts` | `MODULE_SDK_VERSION=1.0.0`, engines `^1.0.0` at stamp |
| manifests from sdk | engines fields consistent |
| boot validation | reject modules outside supported engines (clear error, spec 03) |
| `packages/module-sdk/src/compile/create-ctx.ts` | readModel + `emit` wiring + moment guards (E15/E19/E20) |
| `packages/module-sdk/tests/compat/**` | cover all capability kinds used in 1.0 + readModel + events in ctx |

### 5.4 Freeze process (phases = sequencing, not quality tiers)

**Phase A — Draft lock (S2)**  
- sdk-reference: “1.0 freeze in progress”  
- land compatibility.md + CHANGELOG skeleton  
- ban author-breaking merges without major plan  

**Phase B — Stamp (S6 with spec 07)**  
- versions 1.0.0  
- header **Normative SDK 1.0**  
- CHANGELOG `## 1.0.0`  

Phase B **blocked** until specs 02–06 are `done`.

## 6. DoD (production — all required)

- [ ] `docs/modules/compatibility.md` complete (§5.2) and linked
- [ ] `docs/modules/CHANGELOG.md` exists with process
- [ ] Capability kinds frozen in sdk-reference (incl. `events`)
- [ ] Moments table marked normative (matches §4.2) incl. `emit` column + `event.dispatch` row
- [ ] Lifecycle hooks locked (§4.5)
- [ ] Non-author boundary in compatibility.md + modules README
- [ ] IR dual-load / major-cut policy written
- [ ] engines validation behavior documented + tested
- [ ] At stamp: `MODULE_SDK_VERSION === "1.0.0"`
- [ ] At stamp: first-party modules compatible with sdk `^1.0.0`
- [ ] Author docs contain **zero** instructional use of ports/interceptors (only “do not use”)
- [ ] `bun run test:compat` green and required in CI docs

## 7. Verification

```bash
# artifacts
test -f docs/modules/compatibility.md
test -f docs/modules/CHANGELOG.md

bun run test:compat
bun run test:module-sdk
bun run typecheck
```

| Check | Pass |
|-------|------|
| Author onboarding | only `docs/modules/*` |
| Ports leak | no teach-ports in author guides |
| Engines | module with unsupported engines.core fails boot with stable code |

## 8. Implementation checklist

- [ ] Write compatibility.md
- [ ] Write CHANGELOG.md skeleton
- [ ] Lock moments/capabilities wording in sdk-reference (candidate → normative at stamp) incl. events + lifecycle
- [ ] Engines boot validation + test
- [ ] Compat fixtures cover seed, guard, afterProse, host, config, tool, schedule, access, readModel
- [ ] Compat fixture: IR JSON round-trip (serializable, no closures) + engines validation ready for foreign IR producers
- [ ] Tests: committed + `ctx.op` → `MODULE_MOMENT_OP_FORBIDDEN`; unknown readModel → `MODULE_READ_MODEL_UNKNOWN`; emit in forbidden moment → `MODULE_EVENT_EMIT_FORBIDDEN`; event handler `ctx.op` → `MODULE_MOMENT_OP_FORBIDDEN`
- [ ] Stamp versions in S6 (with 07)
- [ ] ADR 0004 freeze note

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Stamp before platform ready | Phase B blocked on 02–06 done |
| Hidden IR break | dual-load policy + compat fixtures |
| Freeze too tight for readModel | readModel is ctx method additive under existing kinds (06); document as 1.0 surface |
| Events surface too tight | closed 1.0 set; dynamic subscription = post-1.0 additive minor; dispatch semantics change = MAJOR (locked) |

## 10. Exit

Spec **done** when Phase B complete, §6 checked, §7 green in release PR.
