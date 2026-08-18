# `@rpengineext/host-bootstrap`

Shared composition root for CLI and API hosts.

- reads `RP_*` env (`packages/host-bootstrap/src/env.ts`)
- opens sqlite + trace sink + story catalog (`data/stories`)
- wires first-party modules:
  - `@rpengineext/module-working-memory`
  - `@rpengineext/module-world-canon`
  - `@rpengineext/module-character`
- configures mock or live `LlmPort` (`@rpengineext/agents-responses`)
- returns `HostRuntime` (`engine`, `runtime`, `events`, `storyCatalog`, `stop`, …)

```ts
import { createHostRuntime } from "@rpengineext/host-bootstrap";

const boot = await createHostRuntime({ forceMock: true });
if (!boot.ok) throw new Error(boot.error.message);
const { engine, stop } = boot.value;
// ...
await stop();
```

Optional `extraModules` appends more modules after the defaults.
