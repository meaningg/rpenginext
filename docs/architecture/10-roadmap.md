# Roadmap

> **Статус:** Phase 4 complete + core finalize pass (wiring / permissions / agent queue / repair hints)  
> Phase 5+ next: product modules on frozen contracts (explicit tasks only). Core changes only via ADR.

## Decisions locked

| Topic | Decision |
|-------|----------|
| Architecture | CPA (contracts + pipeline) |
| Turn atomicity | **full-atomic** — any fatal failure rolls back to turn start |
| Hosts v1 | CLI + HTTP API (`apps/api`) + Web UI (`apps/web`) via `host-bootstrap` |
| Persistence v1 | `bun:sqlite` |
| First-party modules (shipped) | working-memory, character, world-canon |
| Further domain modules (npc/plot/summarizer/…) | **out of scope** until separate tasks |
| Story templates in git | **examples only** (`demo.hello`, `demo.book`); other JSON local/private |
| Narrative failure | fail turn + full rollback (no fallback-keep-state) |
| Turn debug traces | **core** markdown dossiers (`.md`) |

## Phase 0 — Documentation lock

- [x] overview + principles
- [x] core / modules / state / agents / pipeline docs
- [x] full-atomic turn model
- [x] bun:sqlite + CLI host choice
- [x] maintainer explicit “утверждаю, можно contracts/core”
- [x] wide extension surface draft (`12-extension-surface.md`: registries + interceptors + typed ports)
- [x] maintainer freeze approval of extension surface v1

## Phase 1 — Contracts skeleton

- [x] types: Result, ids, WorldState, StateCommand, Passage, TurnResult
- [x] extension point interfaces (closed set v1)
- [x] manifest schema
- [x] permission tokens
- [x] base agent task schema (`narrative.write`, `action.interpret`)
- [x] package `@rpengineext/contracts` + schema tests (18)

**Exit:** package builds, types only, schema tests. ✅

## Phase 2 — Core kernel vertical slice

- [x] ModuleRegistry (load zero or one **test fixture** module — not product npc/plot)
- [x] StateKernel dry-apply + single final commit / discard
- [x] TurnPipeline stages with full rollback
- [x] SessionRuntime submitAction
- [x] mock AgentOrchestrator
- [x] **TurnTracer** + markdown renderer + mock sink (tests for commit/reject traces)
- [x] CLI host skeleton

**Exit:** CLI “hello turn” without real LLM; atomicity + trace golden tests green. ✅

## Phase 3 — Persistence + real narrative path + fs traces

- [x] `packages/persistence/sqlite` on `bun:sqlite`
- [x] turn COMMIT = sqlite `commitTurn` transaction + memory publish
- [x] LlmPort adapter (`@rpengineext/agents-responses`, POST `/v1/responses`)
- [x] `narrative.write` end-to-end (mock + live)
- [x] failure paths prove full rollback (including LLM fail)
- [x] filesystem `TraceSink` under `data/traces/...`

**Exit:** minimal book loop in CLI with save/load + readable `.md` turn dossiers. ✅

## Phase 4 — Hardening

- [x] Wire full extension surface (typed ports + catalogs used at runtime)
- [x] Module permission enforcement on propose / agent call
- [x] `strictManifest` + `failOnMissingCapability` honored
- [x] Stage timeouts + agent `maxParallelPerTurn`
- [x] ConflictResolver path + resource costs / entity resolve / brief policy / status panel / …
- [x] Optional `action.interpret` (config `agents.enableActionInterpret`)
- [x] Agent tools (`registerAgentTool` + `addAgentToolHandler` + orchestrator.invokeTool)
- [x] SystemTurnScheduler queue drained after player commit
- [x] Slice migrations on `loadSession`
- [x] Journal replay helper (`replayJournal` / `SessionRuntime.replaySessionJournal`)
- [x] Host surface aggregation (help / debug / CLI commands / save metadata / read models)
- [x] Idempotency bound + restore from snapshot turnIds; seed in snapshot meta
- [x] Restore turn kind (no LLM) when loaded session lacks passage
- [x] Core finalize pass: module-scoped permissions; agent queue on plan/propose/narrate;
      AgentTaskContributor@narrate; repair hints → LLM; conflict path match;
      moduleConfig boot validation; memory-kind validate; dead code removed
- [ ] Richer CLI UX polish (host app; core APIs ready via HostSurface)
- [x] HTTP API host (`apps/api`) + React web UI (`apps/web`) + shared `host-bootstrap`
- [x] Story templates catalog (`data/stories` + `content-stories`)
- [x] SSE turn progress + optional draft LLM stream deltas (non-authoritative until commit)
- [ ] Content safety hooks (optional, deferred)

**Exit:** core matches normative extension surface + hardening; unit/integration tests green. ✅

## Phase 5+ — Further product modules (separate tasks only)

Shipped first-party (not “future examples”):

- `working-memory`, `character`, `world-canon`

When requested explicitly, one **new** module per task, against frozen contracts:

- candidates: npc, plot-controller, richer fandom-canon/RAG, summarizer, …

## Explicit non-goals until later

- implementing large domain modules “by default” without a task
- multiplayer simultaneous turns / shared world
- graphical engine
- marketplace
- fallback passage that keeps mutated state
- soft-commit narrative invent loop
