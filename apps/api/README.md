# `@rpengineext/api`

HTTP host for the engine: REST + SSE. Does **not** live in core.

## Run

```bash
# from monorepo root
bun run api:mock    # mock agents
bun run api         # live LLM (needs .env)
```

Default: `http://127.0.0.1:8787`

## Main routes

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | no | versions + agents mode |
| POST | `/v1/players` | no | local player + token |
| GET | `/v1/templates` | no | story catalog |
| GET/POST | `/v1/sessions` | yes | list / create from template |
| GET | `/v1/sessions/:id` | yes | summary + passage |
| POST | `/v1/sessions/:id/actions` | yes | `?wait=1` for sync |
| GET | `/v1/sessions/:id/events` | yes | SSE progress + draft stream |
| POST | `/v1/sessions/:id/save` | yes | explicit save |

Auth headers: `Authorization: Bearer <token>`, `X-Player-Id: <id>`.

## Env

See `packages/host-bootstrap` / root README (`RP_HTTP_HOST`, `RP_HTTP_PORT`, `RP_CORS_ORIGIN`, `RP_STORIES_DIR`, `RP_PLAYER_TOKEN_SECRET`, …).

## Tests / playability

```bash
bun test apps/api                 # integration + mock e2e
bun run test:e2e                  # mock HTTP book loop
bun run test:e2e:live             # REAL LLM e2e (needs .env RP_LLM_*)
bun run smoke:play                # prefers live LLM if credentials exist
bun run smoke:play:live           # require real LLM
bun run smoke:play:mock           # force mock
# against a running live API:
bun run api                       # not api:mock
bun run apps/api/scripts/play-smoke.ts --live --url http://127.0.0.1:8787
```
