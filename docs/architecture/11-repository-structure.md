# Repository Structure

> **Статус:** normative target layout  
> Сейчас репозиторий — early scaffold; структура ниже — цель при имплементации.

## 1. Target monorepo

```text
rpengineext/
  apps/
    cli/                         # player/dev host
    api/                         # HTTP REST + SSE host
    web/                         # React + Tailwind UI
  packages/
    contracts/                   # public schemas & ports (semver heart)
    core/                        # stable engine
    host-bootstrap/              # shared CLI/API composition root
    content-stories/             # story template catalog loader
    shared/                      # pure helpers
    agents/
      responses/                 # Responses API LlmPort
    persistence/
      sqlite/                    # bun:sqlite driver (v1)
    modules/
      working-memory/
      npc/
      plot-controller/
      fandom-canon/
      summarizer/
    testing/                     # test runtime helpers
  data/
    stories/                     # JSON story templates
  docs/
    architecture/                # this set
    adr/
    modules/
  scripts/
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
core → contracts, shared
modules/* → contracts, shared
agents/* → contracts, shared
persistence/* → contracts, shared
contracts → (minimal/no deps)
```

Forbidden:

- `modules/*` → `core/src/**` internals
- `core` → `modules/*` concrete packages (dynamic load via host registry only)

## 3. contracts package content

```text
contracts/
  src/
    index.ts
    ids.ts
    result.ts
    state/
    commands/
    modules/
      manifest.ts
      extension-points.ts
      permissions.ts
    agents/
    turn/
    persistence/
    events/
```

## 4. core package content

```text
core/
  src/
    create-engine.ts
    registry/
    session/
    pipeline/
      stages/
    state/
    agents/
    events/
    config/
  src/testing/                   # optional export surface
```

## 5. Why monorepo

- single versioned contracts visible to all authors;
- golden tests across core+modules;
- still allows later extract of community modules to separate repos that depend on published `@rpengineext/contracts`.
