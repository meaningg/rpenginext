# Spec 02 — Module Test Harness, Stress & Platform CI (Production)

| Field | Value |
|-------|--------|
| **Status** | `ready` |
| **Priority** | P0 |
| **Depends on** | Spec 00 |
| **Blocks** | Spec 05 scaffold tests; Spec 07 tag |
| **Owner area** | `module-sdk/src/test`, tests, core tests, root scripts |
| **Release mode** | production — no “defer save/load” escapes |

## 1. Goal

Production quality bar for module/platform tests:

- author tests modules without full app;
- CI catches multi-module and atomicity regressions before merge/tag;
- first-party modules and scaffold use the **same** harness.

## 2. Current state

| Piece | State |
|-------|--------|
| `testModule` | single module, thin API |
| first-party tests | often raw `createTestEngine` |
| `test:compat` | exists |
| stress / `test:platform` | missing |
| tool/background harness helpers | incomplete |

## 3. Scope

### In scope (all required)
- Full `@rpengineext/module-sdk/test` harness (multi-module, save/load, background, system turns)
- LLM mocks: fixed prose **and** scripted tool-calling
- Stress suite N≥30 + cases S01–S12
- Atomicity pack A01–A08 (no optional gaps)
- First-party integration tests on harness
- Root scripts + docs

### Out of scope
- Live LLM as **merge/tag blocker** (optional separate job `test:e2e:live`)
- Web visual regression suite expansion
- Replacing all core unit tests with harness

## 4. Harness API (normative for 1.0)

Export: `@rpengineext/module-sdk/test`

### 4.1 Boot

```ts
testModule(module, options?) → Result<ModuleTestHarness, Failure>
testModules(modules, options?) → Result<ModuleTestHarness, Failure>
```

`TestModuleOptions` (minimum):

| Field | Purpose |
|-------|---------|
| `meta?` | session meta |
| `moduleConfig?` | module config bag |
| `llm?` | `LlmPort` |
| `agentsMode?` | `mock` \| `llm` |
| `seed?` | deterministic seed |
| `strictCapabilities?` | default **true** |
| `persistence?` | real or in-memory capable of save/load (must support harness save/load) |

### 4.2 Harness surface (all required — no defer)

| API | Behavior |
|-----|----------|
| `sessionId` | current session |
| `turn(text)` | free_text player turn |
| `action(playerAction)` | any player action |
| `systemTurn(reason, payload?)` | run/drain system turn path |
| `waitIdle(timeoutMs?)` | wait background system work; fail on timeout |
| `save()` | returns save pointer/id |
| `load(pointer)` | restores session; harness rebounds to loaded session |
| `slice` / `sliceOf(name)` | slice access |
| `state()` | readonly world snapshot |
| `modules` | manifest summaries |
| `readModel(name, args?)` | host/engine readModel if exposed to tests |
| `stop()` | dispose |

### 4.3 Asserts (required)

```ts
expectCommitted(turn: TurnResult): void
expectRejected(turn: TurnResult, code?: string): void
expectSlice(harness, name, partial): void
```

### 4.4 LLM mocks (required)

```ts
fixedProseLlm(prose: string): LlmPort
scriptedToolLlm(script: ToolScriptStep[]): LlmPort
```

`scriptedToolLlm` must support character-like flow: model requests tool → tool runs → final output.  
Used by first-party character tests and stress S09/S11.

## 5. Implementation

### 5.1 Layout

```text
packages/module-sdk/src/test/
  index.ts
  harness.ts
  asserts.ts
  llm-mocks.ts
```

### 5.2 First-party migration (required)

| Package | Action |
|---------|--------|
| working-memory | integration → harness |
| character | integration → harness + `scriptedToolLlm` for outfit path |
| world-canon | integration → harness |
| pure unit helpers | may stay without harness |

### 5.3 Compat

- Keep `tests/compat` goldens
- Extend when 1.0 surface grows (readModel)
- Gate on every sdk/core PR

### 5.4 Stress suite (required)

Location: `packages/module-sdk/tests/stress/`  
Generator: `createNoopStressModule(i)` via `defineModule`.

**N=30 means thirty lightweight no-op / fixture modules**, not thirty product domain modules. Goal = multi-module boot/order/save pressure, not content coverage.

| ID | Case | Expect |
|----|------|--------|
| S01 | Boot **N=30** no-op modules | ok |
| S02 | Duplicate module id | fail, stable code, ids in message |
| S03 | Duplicate slice name | fail, stable code |
| S04 | missing `requires` (strict) | fail boot |
| S05 | 5 modules `op` own slices one turn | all committed |
| S06 | A cannot write B slice | deny/fail; B unchanged |
| S07 | `access.read` foreign in narrative | ok; no foreign write |
| S08 | narrative section order by priority | deterministic |
| S09 | 2× `scheduleSystem` background | player ok; `waitIdle`; no corruption |
| S10 | save/load ≥10 slices | roundtrip equality |
| S11 | tool `proposeOp` in system turn | state updated only after successful path; no partial leak on deny |
| S12 | moduleConfig invalid | boot/turn fail clear code (align 03) |
| S13 | `ctx.op` inside `committed` | fail with `MODULE_MOMENT_OP_FORBIDDEN`; world unchanged beyond already-committed player turn |
| S14 | unknown `ctx.readModel` name | fail with `MODULE_READ_MODEL_UNKNOWN` |

Perf tripwire (same suite or adjacent):

| ID | Case |
|----|------|
| P01 | Boot N=30 under recorded generous bound |
| P02 | One mock turn with N=30 empty handlers under bound |

**Bounds process (required):**
1. On first green stress PR, record wall-time baseline on CI-class machine (or documented local reference).
2. Write numbers into `packages/module-sdk/tests/stress/README.md` (or comment header) with ≥3× headroom.
3. Fail only on pathological regression (e.g. >3× baseline or absolute ceiling), not micro-bench flake.
4. Re-baseline only with explicit PR note when intentional cost is added.

### 5.5 Atomicity pack A01–A08 (all required)

| ID | Case |
|----|------|
| A01 | guard deny → full rollback |
| A02 | LLM fail → full rollback |
| A03 | invariant fail → rollback |
| A04 | tool handler deny → no partial world write |
| A05 | foreign slice propose denied |
| A06 | system turn skips `narrative.write` |
| A07 | background system: next player waits / serial session |
| A08 | journal replay matches state |

If a case lacks coverage today — **add tests**. “If helper exists” is not allowed.

### 5.6 Root scripts (normative names)

```json
{
  "test:modules-stress": "bun test packages/module-sdk/tests/stress",
  "test:platform": "bun test packages/module-sdk/tests/compat packages/module-sdk/tests/stress && bun test packages/core && bun test packages/modules/working-memory packages/modules/character packages/modules/world-canon"
}
```

Also ensure `test:compat`, `test:module-sdk` remain.

## 6. DoD (production — all required)

### Harness
- [ ] `testModules` multi-module
- [ ] `turn` / `action` / `systemTurn` / `waitIdle`
- [ ] `save` + `load` roundtrip works in harness tests
- [ ] `fixedProseLlm` + `scriptedToolLlm`
- [ ] asserts exported
- [ ] JSDoc on public API
- [ ] harness unit tests

### Suites
- [ ] S01–S14 green (incl. committed-op + unknown readModel)
- [ ] P01–P02 present with **documented** bounds
- [ ] A01–A08 green inside `test:platform`
- [ ] compat green
- [ ] first-party integration on harness (incl. character tool path)
- [ ] Author docs teach harness first; `createTestEngine` advanced-only

### Scripts / docs
- [ ] `test:modules-stress`, `test:platform` work
- [ ] Documented in `docs/architecture/09-testing.md` + modules README

## 7. Verification

```bash
bun run test:module-sdk
bun run test:compat
bun run test:modules-stress
bun run test:working-memory
bun run test:character
bun run test:world-canon
bun run test:platform
bun run typecheck
```

| Check | Pass |
|-------|------|
| Author DX | success-path module test ≤ ~40 lines |
| No network | stress/platform offline |
| Background | S09 stable locally repeated |

## 8. Implementation checklist

- [ ] Implement full harness API §4
- [ ] LLM mocks including scripted tools
- [ ] Stress S01–S14 + P01–P02 (+ baseline bounds doc)
- [ ] Fill atomicity A01–A08 gaps
- [ ] Root scripts
- [ ] Migrate first-party integration tests
- [ ] Update testing docs (harness = author SoT)

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Flaky background | `waitIdle` + mock-only + timeouts |
| Slow platform suite | no-op modules; parallel where safe |
| Harness too magic | advanced escape: `createTestEngine` still available; scaffold uses harness |

## 10. Exit

Spec **done** when §6 complete and §7 green on clean tree/CI.
