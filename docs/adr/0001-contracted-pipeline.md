# ADR 0001: Contracted Pipeline Architecture

## Status

Accepted (implemented through Phase 4)

## Context

Нужен движок пошагового RP в формате интерактивной книги:

- LLM пишет историю и помогает вести NPC;
- core должен оставаться стабильным;
- modules разрабатываются разными людьми по документации;
- ходы атомарны;
- контроль state и логики — у движка, не у модели.

Рассматривались:

1. **Event-driven plugins** — гибко, но слабый контроль order/invariants.
2. **Ports & capabilities only** — хорошая модульность, но без жёсткой модели turn/state AI быстро рассинхронизирует мир.
3. **Authoritative pipeline only** — сильный control, но без явных contracts хуже независимая разработка modules.
4. **Hybrid B+C (CPA)** — fixed turn pipeline + versioned contracts + capability registry + AI as proposer.

## Decision

Принимаем **Contracted Pipeline Architecture (CPA)**:

- authoritative `StateKernel` + **full-atomic** turn (any fatal failure → rollback to turn start);
- single late `COMMIT` publishes state + passage + journal together;
- closed set of extension points (engine-internal contribution bus);
- modules via manifest/permissions/capabilities;
- **author path (superseded detail):** product/external modules use `@rpengineext/module-sdk` / `defineModule` — see [ADR 0004](./0004-module-sdk-cbmd.md); authors do **not** learn pipeline stages or raw ports;
- all LLM calls via `AgentOrchestrator`;
- narrative works from draft brief and is inside the atomic boundary;
- v1 hosts = CLI + HTTP API + Web (see ADR 0002); v1 persistence = `bun:sqlite`;
- further domain modules are not auto-implemented without an explicit task;
- `packages/contracts` is the runtime stability boundary; **author** stability boundary is `module-sdk` (ADR 0004).

## Consequences

### Positive

- core changes become rare and reviewable;
- independent module authors have a clear rulebook;
- atomic turns prevent half-updated worlds;
- easier testing with mock agents;
- player UX stays a simple turn-based RP loop.

### Negative / costs

- more boilerplate (manifests, schemas, commands) — mitigated for authors by Module SDK (ADR 0004);
- LLM cannot freely invent irreversible world facts in prose without commands;
- new **engine** extension points require ADR discipline;
- maintainers still reason about pipeline stages + ports; authors use moments/capabilities only;
- until [ADR 0005](./0005-moments-native-core.md), sdk IR bind adapts onto ports bus (dual-path) — guarded by `test:compat` / stress.

### Neutral

- product systems (npc/plot/canon/summary) will live as modules when requested, not in core.

## Alternatives rejected for foundation

- Pure event bus as source of truth mutations.
- Trusting chat transcript as world state.
- Monolithic “AI dungeon” single prompt without command layer.

## Follow-ups

- [x] Implement contracts package (Phase 1) — `@rpengineext/contracts`
- [x] Core pipeline + full-atomic turns (Phases 2–4)
- [x] Web host, SSE, draft streaming — [ADR 0002](./0002-web-host-and-streaming.md)
- [x] Tool-calling agents + background system turns — [ADR 0003](./0003-tool-calling-and-background-system-turns.md)
- [x] Module SDK author path — [ADR 0004](./0004-module-sdk-cbmd.md)
- [ ] Module Platform 1.0 production tag — [docs/specs](../specs/README.md)
- [ ] Moments-native core (optional) — [ADR 0005](./0005-moments-native-core.md)
- [ ] Possibly ADR for soft-commit narrative invent loop (not v1; still rejected)
