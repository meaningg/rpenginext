# Spec 04 — Host Module Composition & Ops Surface (Production)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Priority** | P1 |
| **Depends on** | Spec 00; Spec 03 for error codes |
| **Blocks** | production multi-module ops; Spec 07 |
| **Owner area** | `host-bootstrap`, CLI, API, config docs |
| **Release mode** | production — env + CLI + API **all required** |

## 1. Goal

В production модули подключаются **явно, конфигурируемо, аудируемо**:

- profiles / env / code options;
- first-party factory catalog;
- strict capability default;
- inventory через runtime + CLI + API;
- без hardcode-only path как единственного способа.

## 2. Current state

`createHostRuntime` hardcodes 3 modules + `extraModules`.  
Insufficient for dozens of modules and production ops.

## 3. Scope

### In scope (all required)
- Module profile system + enable/disable
- First-party in-process factory registry
- `modules` full override (tests/prod advanced)
- `extraModules` for external `Module` instances
- Env knobs
- Default profile backward compatible (`core-book`)
- **Strict capabilities ON by default**
- `listModules()` on `HostRuntime`
- CLI module list
- API module list (`GET /modules` and/or enriched health)
- Structured boot log
- Priority band conventions documented; first-party compliant
- Tests for all composition paths
- Config docs

### Out of scope
- Remote marketplace download / untrusted plugin sandbox
- Hot-reload modules mid-session
- Per-player module sets (unless already trivial — default no)

## 4. Target API

### 4.1 `createHostRuntime` options

```ts
interface CreateHostRuntimeOptions {
  env?: Record<string, string | undefined>;
  forceMock?: boolean;
  loggerName?: string;
  extraModules?: readonly Module[];
  hostEnv?: HostEnv;

  /** Full override — exclusive with profile/id resolution. */
  modules?: readonly Module[];
  moduleProfile?: ModuleProfileId;
  enabledModuleIds?: readonly string[];
  disabledModuleIds?: readonly string[];
}
```

| Option | Behavior |
|--------|----------|
| `modules` | exclusive full list; skip factory profile resolution |
| `moduleProfile` | expand first-party set |
| `enabledModuleIds` | add first-party ids |
| `disabledModuleIds` | remove ids |
| `extraModules` | append prebuilt modules after resolution |

### 4.1.1 Precedence (normative, locked)

```text
IF options.modules is set:
  base = options.modules                    # exclusive Module[] — skip profile/id resolution entirely
ELSE:
  IF options has explicit id-list override OR env RP_MODULES set:
    baseIds = that comma/id list            # order = list order; replaces profile set
  ELSE:
    profile = options.moduleProfile ?? env RP_MODULE_PROFILE ?? "core-book"
    baseIds = expand(profile)
  baseIds += options.enabledModuleIds       # add catalog ids
  baseIds -= options.disabledModuleIds      # remove
  baseIds -= parse(env RP_DISABLE_MODULES)  # remove
  base = instantiate(baseIds) from factory catalog

result = base ++ (options.extraModules ?? [])   # extraModules ALWAYS last
```

**Locked decisions:**

| Case | Result |
|------|--------|
| `options.modules` set | use that `Module[]`, then append `extraModules` only |
| `options.modules` + profile / `RP_MODULES` / enable/disable | profile & id knobs **ignored** (no merge fight) |
| `RP_MODULES=a,b` without `options.modules` | catalog instantiate in **list order** |
| same id in `enabledModuleIds` and `disabledModuleIds` | **fail boot** `CONFIG_INVALID` with both lists in details |
| `disabled` removes id not present | no-op (debug log ok) |
| unknown catalog id in enable / `RP_MODULES` | fail `MODULE_UNKNOWN` |
| duplicate id after merge (incl. `extraModules`) | fail `MODULE_ID_DUPLICATE` |
| empty set (`none` + no extra) | allowed; core loop still boots |
| equal `priority` in any ordered surface | tie-break = **registration order** (position in resolved `base ++ extraModules`), deterministic; never Map/random order |

Precedence summary: **explicit code options > env > defaults**. Exclusive `modules` short-circuits profile/id resolution; `extraModules` still appends.

**Registration order is normative** (position in the resolved `base ++ extraModules` list): it is the deterministic tie-break for equal `priority` across all ordering-sensitive surfaces — narrative sections, turn moments, event dispatch (spec 06 §7), init/shutdown (spec 06 §8).

### 4.2 Profiles (required)

| id | Modules |
|----|---------|
| `core-book` | working-memory, world-canon, character (**default**) |
| `minimal` | working-memory |
| `none` | empty first-party (only extra/override) |

### 4.3 Factory catalog

Prefer `packages/host-bootstrap/src/module-catalog.ts` until a second consumer needs a package split.

| id | factory |
|----|---------|
| `working-memory` | `createWorkingMemoryModule` |
| `world-canon` | `createWorldCanonModule` |
| `character` | `createCharacterModule` |

Unknown id → boot fail `MODULE_UNKNOWN` (spec 03) with hint.

### 4.4 Env (required)

| Env | Meaning |
|-----|---------|
| `RP_MODULE_PROFILE` | profile id (`core-book` \| `minimal` \| `none`) |
| `RP_MODULES` | comma list **replaces** profile’s first-party set (list order) |
| `RP_DISABLE_MODULES` | comma list disable after resolution |

Examples:

```bash
# default = core-book (wm + canon + character)
RP_MODULE_PROFILE=minimal          # working-memory only
RP_MODULES=working-memory,character
RP_DISABLE_MODULES=character       # drop character from resolved set
```

Document in `docs/architecture/08-configuration.md`, API/CLI READMEs.

### 4.5 Engine/host defaults (production)

| Setting | Production default |
|---------|-------------------|
| fail on missing capability | **true** |
| strict manifest (if applicable) | true for production host profile |
| module list logging | info on boot |

### 4.6 Module config & secrets (normative)

| Rule | Value |
|------|-------|
| `moduleConfig` is not a secrets channel | значения могут попасть в конфиг-дампы / логи / error-контекст — api keys и токены запрещены |
| Secrets | process env, читается кодом модуля напрямую (ответственность автора); host не проксирует env в модули в 1.0 |
| Failures | значения конфига/секретов не появляются в failure details (spec 03 §4.1) |
| Validation | `moduleConfig` zod schema на boot; fail → `CONFIG_INVALID` (E07) |

## 5. Priority bands (required doc)

`docs/modules/conventions.md` (or equivalent):

| Band | priority | Use |
|------|----------|-----|
| 0–9 | infra | memory, time |
| 10–29 | world facts | canon, character |
| 30–59 | entities | npc, inventory |
| 60–79 | systems | combat, plot |
| 80–99 | presentation | status |
| 100+ | default | low |

Tie-break for equal priority inside one band: **registration order** (§4.1.1); никогда не случайный порядок.

First-party must fit bands (wm 10, canon 15, character 20).  
Optional runtime warn if priority outside 0–1000 in dev.

## 6. Debug / ops surface (all required)

### 6.1 Runtime

```ts
listModules(): ReadonlyArray<{
  id: string;
  version: string;
  priority: number;
  provides: readonly string[];
  requires: readonly string[];
  slices: readonly string[];
}>
```

### 6.2 CLI

`bun run cli --modules` and/or REPL `modules` → table.

### 6.3 API

`GET /modules` **required** (dedicated).  
Health may also include summary, but dedicated route is the ops contract.

### 6.4 Boot log

Structured field: array of `{ id, version, priority }`.

## 7. Implementation checklist

- [ ] module-catalog + factories
- [ ] resolve profile/env/options in createHostRuntime
- [ ] exclusive `modules` override
- [ ] default core-book parity tests
- [ ] strict capabilities default ON + test
- [ ] MODULE_UNKNOWN on bad id
- [ ] listModules on HostRuntime
- [ ] CLI list
- [ ] GET /modules + tests
- [ ] boot log
- [ ] conventions priority bands
- [ ] configuration docs
- [ ] integration: disable character via env; extraModules fourth module
- [ ] enabled∩disabled non-empty → fail boot
- [ ] options.modules ignores RP_MODULE_PROFILE

## 8. DoD (production — single list, all required)

- [ ] Programmatic: profile, enable/disable, extraModules, full override
- [ ] Env: `RP_MODULE_PROFILE`, `RP_MODULES`, `RP_DISABLE_MODULES`
- [ ] Default boot = core-book behavior preserved
- [ ] Strict missing capability fails boot by default
- [ ] Unknown module id fails with `MODULE_UNKNOWN`
- [ ] `listModules()` works
- [ ] CLI lists modules
- [ ] `GET /modules` works
- [ ] Boot log includes module inventory
- [ ] Profiles `core-book`, `minimal`, `none`
- [ ] Priority bands documented; first-party compliant
- [ ] Equal-priority tie-break = registration order (tested)
- [ ] `moduleConfig` secrets policy documented in 08-configuration (§4.6)
- [ ] Tests cover: default, env override, disable, extraModules, unknown id, modules override, strict requires
- [ ] Docs: 08-configuration + host READMEs + modules “how to wire”

## 9. Verification

```bash
bun run test:host-bootstrap
bun run test:api
bun run test:cli   # if present; else manual CLI check documented
bun run typecheck
```

Manual:

| Check | Pass |
|-------|------|
| `GET /modules` | shows 3 default modules |
| `RP_DISABLE_MODULES=character` | no character slice after new session |
| extraModules | 4th module loaded |
| typo id | fail with code + id |

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Break default boot | parity tests vs current three modules |
| Env/options fight | documented precedence |
| Catalog bloat | keep in host-bootstrap until needed |

## 11. Exit

Spec **done** when §8 fully checked and §9 green — **no MVP subset**.
