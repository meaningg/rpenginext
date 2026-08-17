# `@rpengineext/host-bootstrap`

Shared composition root for CLI and API hosts.

- reads `RP_*` env
- opens sqlite + trace sink + story catalog
- wires working-memory module + LLM/mock agents
- returns `HostRuntime` (`engine`, `runtime`, `events`, `stop`, …)

```ts
import { createHostRuntime } from "@rpengineext/host-bootstrap";

const boot = await createHostRuntime({ forceMock: true });
if (!boot.ok) throw new Error(boot.error.message);
const { engine, stop } = boot.value;
// ...
await stop();
```
