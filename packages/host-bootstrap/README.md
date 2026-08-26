# `@rpengineext/host-bootstrap`

Shared composition root for CLI and API hosts (Module Platform 1.0, spec 04).

- reads `RP_*` env (`packages/host-bootstrap/src/env.ts`)
- opens sqlite + trace sink + story catalog (`data/stories`)
- wires first-party modules via **module catalog + profiles**:
  `core-book` (default: working-memory, world-canon, character) | `minimal` (working-memory) | `none`
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
```

### Options

| Option | Behavior |
|--------|----------|
| `modules` | exclusive full `Module[]` (skips profile/id resolution) |
| `moduleProfile` | `core-book` \| `minimal` \| `none` |
| `enabledModuleIds` / `disabledModuleIds` | add / remove catalog ids |
| `extraModules` | append prebuilt `Module` instances (**always last**) |

Профили и полная матрица: [specs/04](../../docs/specs/04-host-composition.md) ·
[08-configuration](../../docs/architecture/08-configuration.md).  
Inventory: CLI `bun run apps/cli/src/main.ts --modules` · API `GET /modules`.