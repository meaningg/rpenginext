# `@rpengineext/contracts`

Public **schemas, ports, and extension surface** for rpengineext.

This package is the semver heart of the monorepo:

- `core` implements runtime against these types
- `modules/*` depend **only** on contracts (+ optional `shared`)
- `agents/*` and `persistence/*` implement ports defined here

## Install (workspace)

```bash
bun install
```

```ts
import {
  CONTRACTS_VERSION,
  parseModuleManifest,
  parseStateCommand,
  ok,
} from "@rpengineext/contracts";
```

## Contents

| Area | What |
|------|------|
| `Result` / ids / JSON | boundary primitives |
| `WorldState`, `StateCommand`, `Proposal` | authoritative mutation model |
| Turn types | stages, action, passage, `TurnResult` |
| Module system | manifest schema, permissions, register context, ports A/B/C |
| Agents | `AgentTask`, standard `narrative.write` / `action.interpret`, `LlmPort` |
| Persistence | `PersistencePort`, snapshot, journal |
| Tracing | `TraceSinkPort`, module `TraceNote` |
| Events / Engine | observe-only events, host `Engine` / `Session` shapes |

Schema validation uses **Zod v4** (`safeParse` helpers on key wire types).

## Normative docs

- `docs/architecture/02-core.md`
- `docs/architecture/03-module-system.md`
- `docs/architecture/04-state-and-commands.md`
- `docs/architecture/12-extension-surface.md`

## Tests

```bash
bun test packages/contracts
```

## Version

`CONTRACTS_VERSION` is exported from the package root. Modules declare it in `manifest.engines.contracts`.
