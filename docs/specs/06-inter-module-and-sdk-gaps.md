# Spec 06 — Inter-Module Contracts & SDK Composition APIs (Production)

| Field | Value |
|-------|--------|
| **Status** | `ready` |
| **Priority** | P2 |
| **Depends on** | Specs 01, 02, 04 |
| **Blocks** | safe multi-module production; Spec 07 |
| **Owner area** | module-sdk ctx, registry readModels, CI boundaries, docs |
| **Release mode** | production — baseline + **`ctx.readModel` required**; `turn.plan` post-1.0 |

## 1. Goal

Модули в production стыкуются **без** import internals:

- strict `provides`/`requires`;
- package boundary CI;
- documented public contracts;
- first-class **`ctx.readModel`** for stable cross-module queries.

## 2. Current state

- capability graph, `access.read`, `host.readModels` exist.
- Cross-module reads often manual slice parse → brittle at scale.
- Risk: `module-a` depends on `module-b` package internals.

## 3. Scope

### In scope for Platform 1.0 (all required)
- Strict capability satisfaction on **default production host**
- CI: forbid `module-*` → `module-*` runtime dependencies
- `docs/modules/conventions.md` inter-module rules + priority bands
- Public contract on all first-party READMEs
- **D. `ctx.readModel(name, args?)`** on `ModuleCtx` — shipped, documented, tested
- Discoverability: readModels listed in module public contract (README); optional manifest metadata if cheap

### Explicit post-1.0 (deferred by design — NOT a cut of baseline)
- **A. `turn.plan` + extras helpers** — only if later product modules need plan bus beyond extras
- B. `rules.costs`
- C. structured action kinds beyond free_text
- Author interceptors / raw ports
- ADR 0005

### Out of scope forever-as-truth
- EventBus as world mutation channel
- Foreign slice writes

## 4. Inter-module rules (normative)

### 4.1 Allowed
1. Own-slice ops/commands only.  
2. Foreign read via `access.read` and/or **`readModel`**.  
3. `provides` / `requires` tokens.  
4. Namespaced turn extras (ephemeral, not SoT).  
5. System turns + AI tools for follow-up writes to **own** slice.  

### 4.2 Forbidden
1. Runtime dependency on another `module-*` package.  
2. Writing foreign slice.  
3. Order races without priority rules.  
4. EventBus mutating world.  
5. Direct LLM SDK.  

### 4.3 Public contract
Every first-party and scaffold module README lists: provides, requires, slice, meta, config, readModels, tasks/tools/system reasons.

## 5. Baseline implementation (required)

### 5.1 Strict capability graph
- Default host/`createEngine` production path: `failOnMissingCapability = true`.  
- Failure code `MODULE_REQUIRES_MISSING` (spec 03).  
- Covered by stress S04.

### 5.2 Boundary CI
- Script `bun run test:module-boundaries`  
- Fails if any `packages/modules/*/package.json` has runtime dep on `@rpengineext/module-*`  
- Allowed runtime: `module-sdk`, `zod`; `contracts` only if justified (prefer types via sdk)  
- `core` devDependency only  

### 5.3 Docs
- `docs/modules/conventions.md` — rules §4 + priority bands (spec 04)  
- First-party README public contracts  

## 6. Required additive: `ctx.readModel` (Item D)

### 6.1 Why production-required
Dozens of modules will otherwise re-parse foreign slices and couple to storage shape. readModels are already registered — authors need a **stable call path**.

### 6.2 API (normative — locked for 1.0)

```ts
// ModuleCtx
readModel(name: string, args?: JsonObject): JsonObject
```

**Behavior (single contract — no dual path):**

| Case | Behavior |
|------|----------|
| found | returns JSON object from registered readModel |
| unknown name | **fail loud** in **all** moments (including narrative): turns into turn/boot failure with code `MODULE_READ_MODEL_UNKNOWN`. **No** `undefined`, **no** optional Result dual API on `ModuleCtx` for 1.0 |
| readModel throws | wrapped failure; `details` include caller `moduleId` and `name` when known |
| write | **impossible** via this API |

Rationale: one author pattern; silent misses caused brittle cross-module bugs at scale.

Permissions: readModel does not grant slice write; respect any future read ACLs if introduced.

### 6.3 Implementation touchpoints
- `packages/module-sdk/src/types/context.ts`
- `packages/module-sdk/src/compile/create-ctx.ts`
- wiring to contribution index / host readModel registry
- sdk-reference + CHANGELOG 1.0 (part of surface)
- tests:
  - module B calls `working_memory.window` (or fixture readModel) successfully
  - unknown name → stable code
  - access does not allow write

### 6.4 DoD (D) — required for tag
- [ ] API on ModuleCtx
- [ ] Documented in sdk-reference moments/ctx table (`readModel` column)
- [ ] Cross-module success test
- [ ] Unknown name → `MODULE_READ_MODEL_UNKNOWN` in **change** and **narrative** moments (both)
- [ ] No silent `undefined` path in public types
- [ ] Compat fixture updated if needed
- [ ] errors.md includes `MODULE_READ_MODEL_UNKNOWN` + fix hint

## 7. Deferred Item A — `turn.plan` (post-1.0)

Not required for Platform 1.0 tag.

Rationale: current extras + change/narrative ordering + readModel cover first wave modules; plan moment is a larger IR/pipeline additive.

When revisited: optional moment, namespaced extras helpers, compat fixture, minor sdk bump — see historical sketch in git history if needed.

**Release notes must list A as deferred.**

## 8. Implementation checklist

### Baseline
- [ ] Strict requires default ON (host + tests)
- [ ] `test:module-boundaries`
- [ ] conventions.md
- [ ] first-party public contracts
- [ ] recipes mention access.read + provides/requires + readModel

### readModel
- [ ] implement + wire
- [ ] tests + docs + error code
- [ ] first-party: at least one readModel remains queryable (working-memory)

### Release hygiene
- [ ] note Item A deferred in release notes (spec 07)

## 9. DoD (production — all required)

- [ ] Strict capability satisfaction on default host
- [ ] `test:module-boundaries` green in CI / platform gate
- [ ] conventions.md published and linked
- [ ] All first-party modules have public contract sections
- [ ] No first-party runtime module→module deps
- [ ] `ctx.readModel` shipped per §6.4
- [ ] Item A explicitly deferred in release notes (not silently dropped without mention)
- [ ] Stress/compat still green

## 10. Verification

```bash
bun run test:module-boundaries
bun run test:compat
bun run test:modules-stress
bun run test:module-sdk
bun run test:host-bootstrap
bun run test:working-memory
bun run typecheck
```

| Check | Pass |
|-------|------|
| missing requires | boot fail |
| module depends on module-* | CI fail |
| readModel cross-module | green |
| unknown readModel | stable code |

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Ports creep | refuse author ports; only readModel |
| readModel as god-API | namespaced model ids; own-module registration only |
| Silent undefined | **banned** — fail loud on unknown in all moments (locked §6.2) |
| Dual Result vs throw API | single throw/fail-loud ctx API only for 1.0 |

## 12. Exit

Spec **done** when §9 complete and §10 green.  
Item A remaining deferred is **success**, not incomplete baseline.
