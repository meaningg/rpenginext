# Spec 03 — Author-Facing Errors (Production)

| Field | Value |
|-------|--------|
| **Status** | `ready` |
| **Priority** | P0 |
| **Depends on** | Spec 00; pairs with Spec 02 stress failures |
| **Blocks** | operable multi-module production; Spec 07 |
| **Owner area** | module-sdk compile/bind, core registry/pipeline, contracts failure codes |
| **Release mode** | production — SHOULD → **MUST** for author-facing paths |
| **Catalog** | E01–**E15** (E15 = forbidden-moment mutate) |

## 1. Goal

В production с десятками модулей misconfig/boot/turn errors:

- **стабильный `code`** (для host/UI/логов);
- **actionable message** (автор чинит без чтения core);
- **moduleId / slice / op** в details;
- без секретов (keys, full prompts) в failure payload.

## 2. Current state

- `Failure` exists; quality uneven (`INTERNAL`, thin messages).
- Stress/duplicate/requires paths will expose gaps — this spec closes them.

## 3. Scope

### In scope (required)
- Normative shape for author-facing failures
- Code catalog + mapping from legacy codes
- E01–E15 paths with automated tests
- `docs/modules/errors.md`
- Helper `moduleFailure(...)` (sdk and/or core)
- Guarantee: host/API still returns structured `Failure`

### Out of scope
- Full i18n
- Pretty web error pages (host maps codes later)
- Rewriting unrelated non-module core errors

## 4. Error contract (normative)

### 4.1 Shape — MUST for author-facing failures

| Field | Requirement |
|-------|-------------|
| `code` | **MUST** — stable token |
| `message` | **MUST** — what failed + Hint |
| `details.moduleId` | **MUST** when single module known |
| `details.moduleIds` | **MUST** when multiple (e.g. duplicate) |
| `details.slice` / `op` / `capability` / `configKey` / `taskType` / `toolId` | **MUST** when applicable |
| `causedBy` | optional nested |
| secrets | **MUST NOT** appear (api keys, raw full LLM dumps) |

Message pattern:

```text
[<code>] <what failed> (module: <id>). Hint: <what to do>.
```

### 4.2 Code catalog (production minimum)

Reuse existing contract codes when present; add missing to **single source** in contracts.

| Code | When |
|------|------|
| `MODULE_DEFINE_INVALID` | defineModule/normalize invalid |
| `MODULE_IR_BIND_MISMATCH` | IR/binding structural mismatch |
| `MODULE_ID_DUPLICATE` | duplicate module id |
| `MODULE_SLICE_DUPLICATE` | duplicate slice name |
| `MODULE_REQUIRES_MISSING` | unsatisfied requires |
| `MODULE_CAPABILITY_INVALID` | bad token / cycle |
| `MODULE_ENGINES_INCOMPATIBLE` | engines.core/contracts unsupported |
| `MODULE_UNKNOWN` | host catalog unknown id |
| `MODULE_PERMISSION_DENIED` | propose/agent without permission |
| `MODULE_OP_UNKNOWN` | unknown op name |
| `MODULE_OP_PAYLOAD_INVALID` | payload schema fail |
| `MODULE_READ_MODEL_UNKNOWN` | readModel name missing |
| `MODULE_MOMENT_OP_FORBIDDEN` | `ctx.op` / mutate attempt in moment that forbids writes (e.g. `committed`) |
| `COMMAND_INVALID` | apply/domain deny |
| `SCHEMA_INVALID` | slice/AI schema |
| `CONFIG_INVALID` | moduleConfig / host config |
| `REGISTRATION_INVALID` | strict register mismatch (raw path) |
| module `deny(code)` | **preserve** author code on guard/tool deny |

Legacy mapping: document in `errors.md` + `compatibility.md` if old codes kept as aliases.

### 4.3 Paths that MUST be clear (E01–E15)

| # | Path | Must include |
|---|------|--------------|
| E01 | invalid defineModule id/version | field name |
| E02 | unknown `ctx.op` | moduleId, op, hint of known ops |
| E03 | IR/bind mismatch | moduleId, moment/binding name |
| E04 | duplicate module id | both ids/sources |
| E05 | duplicate slice | slice + module ids |
| E06 | missing requires | moduleId + capability token |
| E07 | moduleConfig schema fail | config key + zod summary |
| E08 | permission deny propose | moduleId, slice, permission |
| E09 | seed meta parse fail | moduleId, fromMeta key |
| E10 | unknown readModel | name + moduleId (caller); **no silent undefined** |
| E11 | engines incompatible | moduleId, required vs actual versions |
| E12 | unknown host module id | id + known ids hint (truncated) |
| E13 | op payload invalid | moduleId, op, zod path |
| E14 | unmigratable slice version | moduleId, slice, fromVersion |
| E15 | `ctx.op` / world mutate in forbidden moment (`committed`, narrative, rejected, …) | moduleId, moment name; **must not** silent-discard ops |

**E15 normative rule:** moments that forbid writes (**especially `turn.committed`**) MUST fail loud on `ctx.op` / `proposeOp` / equivalent mutate. Silent collect-and-drop is **banned** (current 0.x gap — fix before 1.0).

## 5. Implementation

### 5.1 Touchpoints (indicative)

- sdk: `define-module.ts`, `normalize.ts`, `build-ir.ts`, `bind-compiled-module.ts`, `create-ctx.ts`, `resolve-op.ts`
- core: `module-registry.ts`, `capability-graph.ts`, `register-context.ts`, `turn-context.ts`, `turn-pipeline.ts`, session load migrations
- contracts: failure code union/constants
- host-bootstrap: unknown module id

### 5.2 Steps

1. Inventory current codes on module paths.  
2. Add missing codes to contracts.  
3. `moduleFailure(code, message, details)` helper.  
4. Patch E01–E15 call sites (incl. committed op fail-loud).  
5. Automated tests per E0x (unit/integration/stress overlap OK).  
6. Publish `docs/modules/errors.md` + links.

### 5.3 Docs

| Doc | Content |
|-----|---------|
| `docs/modules/errors.md` | full catalog + fix hints + legacy map |
| modules README + sdk-reference | links |

## 6. DoD (production — all required)

- [ ] `docs/modules/errors.md` published and linked
- [ ] Codes centralized; catalog matches implementation
- [ ] E01–E15 each have automated test locking `code` + key details
- [ ] Unknown op / duplicate id / missing requires / committed-op never surface as opaque `INTERNAL` only
- [ ] `committed` + `ctx.op` → `MODULE_MOMENT_OP_FORBIDDEN` (not silent drop)
- [ ] No secrets in failure details (test or review checklist)
- [ ] Host/API still returns structured `Failure`
- [ ] Author can fix E01–E15 without opening core source

## 7. Verification

```bash
bun run test:module-sdk
bun run test:core
bun run test:modules-stress
bun run test:compat
bun run test:host-bootstrap
bun run typecheck
```

Manual:

1. Break requires → message names capability.  
2. `ctx.op("typo")` → `MODULE_OP_UNKNOWN`.  
3. Duplicate id → both modules named.  
4. Bad engines range → `MODULE_ENGINES_INCOMPATIBLE`.

## 8. Implementation checklist

- [ ] Inventory + legacy map
- [ ] contracts codes
- [ ] helper
- [ ] E01–E15 call sites
- [ ] tests (incl. E15 committed mutate)
- [ ] errors.md + links

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Renaming breaks clients | prefer keep codes; improve messages; alias if needed |
| Log noise / PII | redact; never put api keys |
| Maintainer vs author | errors.md = author; internal codes separate |

## 10. Exit

Spec **done** when §6 complete and §7 green; errors.md linked from author docs.
