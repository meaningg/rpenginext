# ADR 0002: Web host (API + UI), SSE progress, and draft LLM streaming

## Status

Accepted

## Context

v1 host was CLI-only. We need a browser book loop with:

- multi-player **parallel single-player sessions** (not shared-world multiplayer);
- story templates as host content;
- SSE progress during long turns;
- optional token/text streaming for narrative while preserving **full-atomic** turns.

Constraints from CPA:

- HTTP must live in `apps/*`, not `packages/core`;
- AI output before commit is draft; reject discards draft;
- modules must not call LLM SDKs directly.

## Decision

1. **Hosts**
   - `packages/host-bootstrap` — shared composition root for CLI and API.
   - `apps/api` — Bun HTTP REST + SSE over `Engine` / `EventBus`.
   - `apps/web` — React + Tailwind UI talking only to API.
   - `packages/content-stories` + `data/stories/*` — story template catalog.

2. **Identity (localhost v1)**
   - Local player id + bearer token stored in host-side sqlite (`data/host.sqlite`).
   - Session ownership enforced in API services; engine session ids remain core ids.

3. **Observe-only progress**
   - Extend `EngineEvent` with `turn.stage`, `agent.task.started`, richer `agent.task.finished`, and `llm.stream.delta`.
   - API maps filtered events to SSE per session.

4. **Streaming**
   - Optional `LlmPort.completeStream` + Responses adapter when enabled.
   - Deltas are **non-authoritative**; UI shows a draft buffer until `turn.committed`.
   - On `turn.rejected`, clients must clear the draft buffer.

5. **Turn HTTP model**
   - Default: `POST .../actions` returns `202` with `turnId`, result arrives via SSE (poll fallback).
   - Optional `wait=1` for synchronous tests.

## Consequences

### Positive

- Core stays a library; web stack is swappable.
- Multi-session concurrency reuses existing per-session busy lock.
- Progress UX works even when provider streaming is unavailable (stage events).

### Negative / trade-offs

- JSON narrative streaming may only deliver useful deltas late or as coarse chunks depending on provider.
- Host DB is a second sqlite file (engine vs identity); acceptable for localhost v1.
- True multiplayer shared world remains out of scope.

## Non-goals

- OAuth / production auth
- Soft-commit narrative mid-stream
- Putting HTTP or React inside core
