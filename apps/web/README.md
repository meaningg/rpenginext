# `@rpengineext/web`

React + Tailwind book UI. Talks only to `apps/api` (no core imports).

## Run

```bash
# terminal 1
bun run api:mock

# terminal 2
bun run web
```

Open `http://127.0.0.1:5173`. Vite proxies `/v1` and `/health` to the API.

## Features

- local player identity in `localStorage`
- story template gallery
- session resume list
- passage + free-text actions
- SSE turn progress and draft narrative stream (cleared on reject; replaced on commit)
