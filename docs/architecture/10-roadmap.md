# Roadmap

> **Статус:** Phase 4 complete + **Module Platform 1.0 shipped** (specs 01–07 `done`, production tag per specs/07).  
> **Next:** product domain modules (npc/plot/…) — **после** platform 1.0, отдельные tasks. Core changes только через ADR/bugfix/proof.

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

## Phase 4.5 — Module Platform 1.0 (production, before mass product modules)

Goal: **production** platform so dozens of modules ship without core churn.
**No MVP tag** — single full gate in specs.

**Specs (normative workstream):** [`docs/specs/README.md`](../specs/README.md)

| Spec | Theme |
|------|--------|
| [00](../specs/00-overview-and-release-gate.md) | Production release DoD, anti-scope, sprints |
| [01](../specs/01-sdk-contract-freeze.md) | SDK contract freeze + semver/IR policy |
| [02](../specs/02-testing-harness-stress-ci.md) | Harness, stress N≥30, atomicity, `test:platform` |
| [03](../specs/03-author-errors.md) | Stable author-facing errors E01–E14 |
| [04](../specs/04-host-composition.md) | Profiles, env, CLI+API module list, strict caps |
| [05](../specs/05-scaffold-and-migrations.md) | All recipes + migrations + scaffold CI |
| [06](../specs/06-inter-module-and-sdk-gaps.md) | Boundaries, conventions, `ctx.readModel` |
| [07](../specs/07-release-and-versioning.md) | 1.0 stamp, docs freeze, production tag gate |

Checklist summary:

- [x] Specs 01–06 `done`; [00](../specs/00-overview-and-release-gate.md) §8 production DoD claimed in release PR
- [x] `MODULE_SDK_VERSION = 1.0.0` + normative author docs (sdk-reference Normative SDK 1.0, compatibility, errors, conventions)
- [x] `test:compat` + `test:modules-stress` + `test:module-boundaries` + `test:scaffold-smoke` + `test:platform` + `test:e2e` + `smoke:play:mock` green
- [x] Events (`events` capability) + lifecycle (`init`/`shutdown`) shipped; moments table normative (spec 01 §4.2)
- [x] `ctx.readModel` shipped (fail-loud unknown, args schema E26)
- [x] Host composition: profiles/env/CLI/API inventory, strict caps default ON
- [x] create-module 8 recipes + scaffold smoke; slice migrations path v1→v2 tested
- [x] Release notes: [`docs/releases/module-platform-1.0.md`](../releases/module-platform-1.0.md)

**Exit:** Module Platform **1.0 production** tagged per [07](../specs/07-release-and-versioning.md).

**Deferred by design (not MVP cuts):** ADR 0005, `turn.plan`, marketplace, multiplayer, live-LLM CI blocker, domain modules as content.

**Until ADR 0005:** sdk IR ↔ ports dual-path is load-bearing — `test:compat` + stress required on sdk/core changes.

**Normative locks already in specs (implement in 4.5, do not re-open casually):**
- `ctx.readModel` fail-loud unknown (`MODULE_READ_MODEL_UNKNOWN`)
- `ctx.op` in write-forbidden moments fail-loud (`MODULE_MOMENT_OP_FORBIDDEN`, esp. `committed`)
- host composition precedence + enabled∩disabled fail
- author tests SoT = `@rpengineext/module-sdk/test`

## Phase 5+ — Further product modules (separate tasks only)

Shipped first-party (not “future examples”), all on **module-sdk**:

- `working-memory`, `character`, `world-canon`
- Author path: `@rpengineext/module-sdk` (`defineModule`)

### Deferred core (not blocking modules)

- [ ] [ADR 0005](../adr/0005-moments-native-core.md) — moments-native core runtime
  (replace ports bus invocation with IR moments; authors unchanged)

When requested explicitly, one **new** module per task, against module-sdk:

- candidates: npc, plot-controller, richer fandom-canon/RAG, summarizer, …
- Start these **after** Phase 4.5 production platform tag (fixture modules inside platform tests do not count as product modules).

## Explicit non-goals until later

- implementing large domain modules “by default” without a task
- multiplayer simultaneous turns / shared world
- graphical engine
- marketplace
- fallback passage that keeps mutated state
- soft-commit narrative invent loop
