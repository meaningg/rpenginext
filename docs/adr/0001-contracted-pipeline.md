# ADR 0001: Contracted Pipeline Architecture

## Status

Accepted (design phase)

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
- closed set of extension points;
- modules via manifest/permissions/capabilities;
- all LLM calls via `AgentOrchestrator`;
- narrative works from draft brief and is inside the atomic boundary;
- v1 host = CLI; v1 persistence = `bun:sqlite`;
- example domain modules are not auto-implemented;
- `packages/contracts` is the stability boundary for multi-author development.

## Consequences

### Positive

- core changes become rare and reviewable;
- independent module authors have a clear rulebook;
- atomic turns prevent half-updated worlds;
- easier testing with mock agents;
- player UX stays a simple turn-based RP loop.

### Negative / costs

- more boilerplate (manifests, schemas, commands);
- LLM cannot freely invent irreversible world facts in prose without commands;
- new extension points require ADR discipline;
- authors must learn pipeline stages.

### Neutral

- product systems (npc/plot/canon/summary) will live as modules when requested, not in core.

## Alternatives rejected for foundation

- Pure event bus as source of truth mutations.
- Trusting chat transcript as world state.
- Monolithic “AI dungeon” single prompt without command layer.

## Follow-ups

- Implement contracts package (Phase 1).
- Possibly ADR for Full-atomic narrative mode details.
- Possibly ADR for soft-commit narrative invent loop (not v1).
