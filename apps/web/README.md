# `@rpengineext/web`

React + Tailwind product UI for the rpengineext book loop. Talks only to `apps/api` (no core imports).

## Stack

- React 19 + Vite + React Router
- Tailwind CSS v4 design tokens (warm book amber)
- TanStack Query for catalog/session server state
- Radix primitives (Dialog, Dropdown, Tooltip, ScrollArea)
- Feature / entity / design-system layering

## Run

```bash
# terminal 1
bun run api:mock

# terminal 2
bun run web
```

Open `http://127.0.0.1:5173`. Vite proxies `/v1` and `/health` to the API.

## Architecture

```text
src/
  app/              # routes + providers
  design-system/    # tokens-aware primitives
  entities/         # player, story, session, turn (api + queries)
  features/         # stories, sessions, play UI/hooks
  widgets/          # AppShell, PlayShell
  pages/            # thin route composition
  shared/           # copy, http helpers, pure libs
```

## Features

- local player identity in `localStorage`

- story catalog + detail / start
- session resume, rename, delete
- immersive reading stream + dialogue inspector
- passage free-text actions
- SSE turn progress and draft narrative stream

## Checks

```bash
bun run --cwd apps/web typecheck
bun test apps/web
```
