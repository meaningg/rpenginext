# `@rpengineext/host-bootstrap`

Shared composition root for CLI and API hosts (Module Platform 1.0, spec 04).

- reads `RP_*` env (`packages/host-bootstrap/src/env.ts`)
- opens sqlite + trace sink + story catalog (`data/stories`)
- wires first-party modules via **module catalog + profiles**:
  `core-book` (default: working-memory, world-canon, character) | `minimal` (working-memory) | `none`
- **module discovery** (ADR 0006): scan roots (`RP_MODULE_DIRS`, default `packages/modules`)
  build the id pool — repo modules attach with zero host code
- configures mock or live `LlmPort` (`@rpengineext/agents-responses`)
- returns `HostRuntime` (`engine`, `runtime`, `events`, `storyCatalog`, `listModules()`, `stop`, …)

## Module composition (precedence locked — specs/04 §4.1.1)

```text
IF options.modules set → that Module[] exactly (+ extraModules last)
ELSE:
  RP_MODULES (or id-list override) → catalog instantiate in list order   [replaces profile]
  profile = options.moduleProfile ?? RP_MODULE_PROFILE ?? "core-book"
  baseIds += enabledModuleIds
  baseIds -= disabledModuleIds && RP_DISABLE_MODULES
result = base ++ (extraModules ?? [])   # extraModules ALWAYS last
```

Errors: unknown id → `MODULE_UNKNOWN`; enabled∩disabled → `CONFIG_INVALID`;
duplicate id after merge → `MODULE_ID_DUPLICATE`; missing `requires` → `MODULE_REQUIRES_MISSING`
(strict default ON).

## Usage

```ts
import { createHostRuntime } from "@rpengineext/host-bootstrap";

const boot = await createHostRuntime({ forceMock: true });
if (!boot.ok) throw new Error(boot.error.message);
const { engine, listModules, stop } = boot.value;
console.log(listModules()); // id / version / priority / provides / requires / slices
// ...
await stop();
```

### Env knobs (module composition)

```bash
RP_MODULE_PROFILE=minimal           # working-memory only
RP_MODULES=working-memory,character # replaces profile set (list order)
RP_DISABLE_MODULES=character        # removes after resolution
RP_MODULE_DIRS=packages/modules     # discovery scan roots (default), reused for selection
```

## Module discovery (ADR 0006) — zero-wiring attach

Любой пакет с полем `rpengineext.module` в `package.json` попадает в id-пул
(каталог ⊕ discovery; каталог побеждает при коллизии). Подключение — только env,
без правок кода:

```jsonc
// packages/modules/mood/package.json
"rpengineext": { "module": { "id": "mood", "entry": "./src/index.ts", "factory": "createMoodModule" } }
```

```bash
RP_MODULES=mood bun run cli --modules   # модуль в пуле и загружен
```

Discovery **не** загружает модули автоматически (пул ≠ включение); невыбранные
модули не импортируются. Невалидная декларация / битый entry / дубль id → boot fail
(`CONFIG_INVALID` / `MODULE_ID_DUPLICATE`). Детали: [ADR 0006](../../docs/adr/0006-local-module-discovery.md).

### Options

| Option | Behavior |
|--------|----------|
| `modules` | exclusive full `Module[]` (skips profile/id resolution **and discovery**) |
| `moduleProfile` | `core-book` \| `minimal` \| `none` |
| `enabledModuleIds` / `disabledModuleIds` | add / remove ids (catalog + discovery pool) |
| `extraModules` | append prebuilt `Module` instances (**always last**) |
| `moduleDirs` | discovery scan roots (default `packages/modules`); explicit roots must exist |

Профили и полная матрица: [specs/04](../../docs/specs/04-host-composition.md) ·
[08-configuration](../../docs/architecture/08-configuration.md).  
Inventory: CLI `bun run apps/cli/src/main.ts --modules` · API `GET /modules`.