# Repository Structure

> **Статус:** normative (current monorepo layout)

## 1. Monorepo layout

```text
rpengineext/
  apps/
    cli/                         # player/dev host
    api/                         # HTTP REST + SSE host
    web/                         # React + Tailwind UI (API only)
  packages/
    contracts/                   # public schemas & ports (semver heart)
    core/                        # stable engine (+ core/testing export)
    logger/                      # structured pino logger
    host-bootstrap/              # shared CLI/API composition root
    content-stories/             # story template catalog loader
    agents/
      responses/                 # Responses API LlmPort
    persistence/
      sqlite/                    # bun:sqlite driver (v1)
    modules/
      working-memory/            # first-party
      character/                 # first-party
      world-canon/               # first-party
      # further product modules (npc, plot, …) — separate tasks
  data/
    stories/                     # JSON templates (examples tracked; private gitignored)
    # runtime: *.sqlite, traces/ — always local / gitignored
  docs/
    architecture/
    adr/
    modules/
  package.json                   # workspace root
  README.md
  .rules
```

## 2. Dependency rules

```text
apps/cli, apps/api → host-bootstrap, core, modules(load), persistence, agents, contracts, content-stories
apps/web → HTTP API only (no core/packages runtime imports)
host-bootstrap → core, contracts, logger, persistence, agents, modules, content-stories
content-stories → contracts
core → contracts, logger
module-sdk → contracts, zod
create-module → (scaffold only; no runtime engine dep required)
modules/* → module-sdk, zod
             (+ core only as devDependency for tests / harness peer)
             (+ contracts only if justified; prefer types via module-sdk)
agents/* → contracts, logger
persistence/* → contracts
contracts → zod (+ minimal)
logger → (minimal)
```

Forbidden:

- `modules/*` → `core/src/**` internals (tests: `@rpengineext/core/testing` or **prefer** `@rpengineext/module-sdk/test`)
- `modules/*` → other `module-*` packages at **runtime** (inter-module only via provides/requires, access.read, readModel)
- `core` → `modules/*` concrete packages (host registry wires modules)
- `apps/web` → any engine package
- author modules → LLM vendor SDKs / raw ports / pipeline interceptors

## 3. Shared utilities

There is **no** separate `packages/shared`. Boundary primitives (`Result`, ids, errors, JSON types)
live in `@rpengineext/contracts`.

## 4. contracts package content

```text
contracts/
  src/
    index.ts
    ids.ts
    result.ts
    errors.ts
    json.ts
    engine.ts
    version.ts
    state/
    modules/          # manifest, catalogs, ports, interceptors, permissions
    agents/
    turn/
    persistence/
    events/
    tracing/
```

## 5. core package content

```text
core/
  src/
    create-engine.ts
    index.ts
    version.ts
    registry/
    session/
    pipeline/
    state/
    agents/
    events/
    config/
    host/
    persistence/      # InMemoryPersistence + port usage
    tracing/
    util/
    testing/          # @rpengineext/core/testing
```

## 6. Story templates policy

| Path | In git? |
|------|---------|
| `data/stories/demo.hello.json` | yes (example) |
| `data/stories/demo.book.json` | yes (example) |
| `data/stories/README.md` | yes |
| other `data/stories/*.json` | **no** (private local) |
| `data/*.sqlite*`, `data/traces/**` | **no** (runtime) |

## 7. Why monorepo

- single versioned contracts visible to all authors;
- golden tests across core+modules;
- still allows later extract of community modules to separate repos that depend on published `@rpengineext/contracts`.
