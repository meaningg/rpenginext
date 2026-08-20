# Spec 05 — create-module Scaffold & Slice Migrations (Production)

| Field | Value |
|-------|--------|
| **Status** | `ready` |
| **Priority** | P1 |
| **Depends on** | Spec 02 (harness), Spec 01 (surface), Spec 03 (migrate errors) |
| **Blocks** | production author onboarding; Spec 07 |
| **Owner area** | `create-module`, recipes docs, migration tests |
| **Release mode** | production — **all recipes + CI scaffold + migrations required** |

## 1. Goal

Production author onboarding:

- scaffold выдаёт **полный** правильный пакет (code, tests, public contract README);
- все ключевые patterns покрыты recipes;
- slice migrations — **поддерживаемый** path с тестами (сейвы не ломаются молча).

## 2. Current state

- Recipes: `state | seed-narrative | guard | full`
- Missing: `ai-tool`, `access-read`, `migrate`
- Tests may not use harness
- Migrations exist in SDK runtime but weak author proof

## 3. Scope

### In scope (all required)
- Recipes: existing upgraded + `ai-tool`, `access-read`, `migrate`
- All recipes: harness tests ≥3 via `@rpengineext/module-sdk/test` (success / reject / edge) — **not** raw `createTestEngine` as primary
- README public contract section on every scaffold
- Migrations recipe + docs + automated v1→v2 load test
- **CI scaffold smoke** (temp dir, all recipes or matrix)
- Docs recipes.md / README updated

### Out of scope
- GUI wizard
- Auto-publish to npm
- Host-side magic beyond core slice migration hooks

## 4. Recipes catalog (complete for 1.0)

| Recipe | Generates | Pattern |
|--------|-----------|---------|
| `state` | slice + ops + turn.change | meters/flags |
| `seed-narrative` | seed + narrative.system | lore/canon |
| `guard` | rules.guard + deny | legality |
| `full` | coherent union of common blocks | starter |
| `ai-tool` | committed → scheduleSystem → ai.task + tool → proposeOp | background AI write |
| `access-read` | access.read + narrative/read from foreign | composition |
| `migrate` | v1→v2 migrations + load test | save compatibility |

CLI:

```bash
bun run create-module <id> --recipe <name>
```

Help lists **all** recipes. Unknown recipe → non-zero exit + message.

## 5. Generated package (normative)

```text
packages/modules/<id>/   # or temp path in CI smoke
  package.json           # runtime: module-sdk, zod; dev: core, types
  README.md              # Public contract section REQUIRED
  tsconfig.json
  src/index.ts
  tests/<id>.test.ts     # harness, ≥3 cases
```

### 5.1 Public contract section (required template)

```markdown
## Public contract
- id / version / priority
- provides / requires
- slice name + schemaVersion
- meta keys (seed)
- config key
- readModels
- system reasons / task types / tools
```

### 5.2 Tests (required per recipe)

Via `@rpengineext/module-sdk/test`:

1. success  
2. reject (guard/deny/invalid)  
3. edge  

**ai-tool (production bar):**  
not “boots only”. Must prove:

- player turn commits;
- system/background path runs (`waitIdle`);
- tool `proposeOp` applies (with `scriptedToolLlm`) **or** explicit deny path tested;
- no world write in `committed` itself.

**migrate:**  
load old schemaVersion fixture → migrated new shape; unmigratable version → stable error (E14).

**access-read:**  
boots with foreign module present; reads without write; missing access behaves safely (documented).

## 6. Migrations (production path)

### 6.1 Author recipe (docs + code)

1. Bump `schemaVersion` in data.  
2. `state.migrations: { [from]: old => new }`.  
3. Ops remain correct for new version.  
4. Test load old save/fixture.

### 6.2 Runtime

- Core migrates on `loadSession` (already).  
- Unknown/unmigratable → **fail load** with `E14` clear error (no silent data drop).  
- Documented in recipes.md + errors.md.

### 6.3 Required tests

- [ ] sdk or fixture module: v1→v2 success  
- [ ] unmigratable version fails clearly  
- [ ] `migrate` recipe includes success test  

## 7. CI scaffold smoke (required)

- Script e.g. `bun run test:scaffold-smoke`
- Creates temp dir (prefer outside repo or cleaned path)
- For **each** recipe: generate → typecheck/test → assert exit 0
- Cleans artifacts
- Wired into `test:platform` or release gate (spec 07)

## 8. Implementation checklist

- [ ] Upgrade existing recipes to harness + contract README
- [ ] Add ai-tool, access-read, migrate
- [ ] Help text complete
- [ ] Migration docs in recipes.md
- [ ] v1→v2 + fail path tests
- [ ] CI scaffold smoke all recipes
- [ ] modules README recipe list
- [ ] No recipe teaches ports or `createTestEngine` as primary path

## 9. DoD (production — all required)

- [ ] All 7 recipes implemented and documented
- [ ] Every recipe: ≥3 harness tests green when scaffolded
- [ ] ai-tool proves schedule + tool propose path (mock)
- [ ] migrate proves load upgrade + hard-fail unmigratable
- [ ] Public contract section always generated
- [ ] `test:scaffold-smoke` green in CI
- [ ] recipes.md complete; no ports leakage
- [ ] First-party modules (existing) still green

## 10. Verification

```bash
bun run test:scaffold-smoke
bun run test:module-sdk
bun run typecheck
# optional manual:
bun run create-module _tmp_ai --recipe ai-tool
```

| Check | Pass |
|-------|------|
| New author | recipe → tests green, no core edit |
| Save upgrade | v1 fixture → v2 slice |
| AI pattern | waitIdle + state change via tool path |

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Scaffold drift | smoke CI each recipe; review vs sdk-reference |
| AI flaky | scriptedToolLlm only |
| Repo pollution | temp dir + cleanup |

## 12. Exit

Spec **done** when §9 complete and §10 green — **no partial recipe set**.
