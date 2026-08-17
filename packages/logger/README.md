# `@rpengineext/logger`

Structured logging for rpengineext (**pino** + optional **pino-pretty**).

Used by `core`, `modules/*`, `agents/*`, `persistence/*`, and hosts via **DI** — no global singleton.

## Install (workspace)

```bash
bun install
```

Package is available as `@rpengineext/logger` inside the monorepo.

## Usage

```ts
import { createLogger } from "@rpengineext/logger";

const root = createLogger({
  name: "rpengineext",
  level: "debug", // or env RP_LOG_LEVEL
  json: false, // pretty colors in terminal; true → NDJSON
});

const coreLog = root.child({ component: "core" });
const turnLog = coreLog.child({
  sessionId: "s_1",
  turnId: "t_42",
  stage: "guard",
});

turnLog.info({ moduleId: "npc" }, "guards passed");
turnLog.error({ err: new Error("boom"), apiKey: "secret" }, "agent failed");
// apiKey is redacted automatically
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `level` | `RP_LOG_LEVEL` or `info` | `debug` \| `info` \| `warn` \| `error` |
| `json` | `false` | `true` = NDJSON; `false` = pretty |
| `name` | — | pino `name` field |
| `bindings` | — | root key/value on every line |
| `redactPaths` | merged with defaults | extra secret field paths |
| `destination` | stdout | custom stream (forces JSON mode) |

## Design notes

- Public type is `Logger` — **pino is not re-exported**.
- Pretty mode uses an **in-process sync** `pino-pretty` stream (not worker
  transport), so API/host and engine child loggers stay ordered on one stdout.
- Secrets: default redact paths cover keys/tokens/Authorization.
- Turn markdown dossiers are **not** this package (see core tracing).
- Levels match architecture: `debug | info | warn | error`.

## Tests

```bash
bun test packages/logger
```
