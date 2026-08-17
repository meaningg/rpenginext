# Turn Pipeline

> **Статус:** normative  
> **Снаружи:** один шаг ролевой игры. **Внутри:** фиксированные стадии + module contributions.

## 1. Player-visible loop

```text
show Passage
  → player submits Action/Choice
  → engine resolves ONE atomic Turn
  → show new Passage OR rejection message (state unchanged)
```

## 2. Turn kinds

| kind | Trigger | Purpose |
|------|---------|---------|
| `player` | user input | основной gameplay turn |
| `system` | runtime | init, postprocess, scheduled module jobs |
| `restore` | load | synthetic, no LLM, rebuild views |

Atomicity rules одинаковы для `player` и `system`.

## 3. Full-turn atomicity (normative)

**Режим единственный:** full atomic turn.

Любая фатальная ошибка на критическом пути хода
(ввод, guard, plan/agent, validate, narrative, present, persistence flush)
⇒ **полный откат** к состоянию на входе в turn (`S0`).
Игрок не получает «полуход».

Технически authoritative state **не меняется**, пока не завершён единый `COMMIT` в конце.
Все стадии до `COMMIT` работают с **draft** (copy-on-write).

```text
S0 = committed state at BEGIN
draft = working copy
... all stages mutate draft / artifacts only ...
on any fatal error: discard draft, return rejected, S0 unchanged
on success: COMMIT draft+passage+journal atomically (as one turn unit)
```

## 4. Fixed stages (v1)

Порядок **нельзя** менять module’ем. Module только встраивается в slots.

```text
0. BEGIN
1. NORMALIZE
2. INTENT
3. GUARD
4. PLAN
5. PROPOSE
6. VALIDATE_COMMANDS
7. NARRATE          # brief from DRAFT (would-be state), not yet committed
8. PRESENT          # Passage artifact in draft
9. COMMIT           # single atomic publish: state + passage + journal
10. AFTER           # observe-only; must not be required for turn success
11. END
```

> Раньше рассматривался commit-before-narrative. **Отклонён.**
> Narrative входит в атомарную границу хода.

### Stage responsibilities

#### 0. BEGIN

- create `turnId`, `TurnContext`;
- session lock;
- emit `turn.started`;
- fix snapshot pointer `S0`;
- open draft from `S0`;
- open `TurnTracer` for this turn (if tracing.enabled).

#### 1. NORMALIZE

- raw input → `NormalizedAction`;
- `InputNormalizer` modules (ordered);
- optional `action.interpret` agent if free-text and enabled.

Failure → reject turn (`INVALID_INPUT`), draft discarded.

#### 2. INTENT

- build `ActionIntent` (who/what/targets/manner);
- `IntentContributor` enrichments.

Failure → reject.

#### 3. GUARD

- run all `Guard` handlers;
- any hard reject stops turn;
- soft warnings may attach to context.

#### 4. PLAN

- `Planner` modules produce plan artifacts;
- orchestrator executes planned agent tasks;
- results stored in context extras (namespaced).

**Required** agent failure on this path → reject entire turn.
Optional tasks must be marked optional explicitly; default for gameplay tasks = required.

#### 5. PROPOSE

- `TransitionContributor` emit `StateCommand` drafts from intent+plan;
- may map agent proposals → commands;
- buffer only (still draft).

#### 6. VALIDATE_COMMANDS

- schema + permissions + progressive dry-apply onto draft state;
- global invariants;
- conflict detection.

Failure → discard draft, `S0` unchanged.

#### 7. NARRATE

- gather `NarrativeContextProvider` slices;
- build `NarrativeBrief` from **draft state** (как будет после успеха) + turn outcomes;
- `narrative.write` agent;
- validate prose payload schema.

Failure (LLM down, invalid schema, timeout after repairs) → **reject turn, full rollback**.
Fallback-passage-with-kept-state **запрещён** в v1.

#### 8. PRESENT

- `ChoiceContributor` modules;
- assemble `Passage` artifact (still not published);
- prepare public view payload.

Failure → reject turn, full rollback.

#### 9. COMMIT

Единственная точка публикации истины:

- apply draft world state → authoritative;
- persist passage record;
- append journal entry;
- bump revision / turnIndex;
- durable flush via persistence (`bun:sqlite`) per policy;
- emit `turn.committed`.

Если persistence flush fails → turn fails; in-memory authoritative state must remain `S0`
(commit = memory+storage as one logical unit; implement via prepare/write/finalize or
write-ahead then publish pointer).

#### 10. AFTER (observe-only)

- метрики, логи, UI events;
- **не** мутирует world state;
- **не** может провалить уже committed turn;
- любые module «post» записи в state = отдельный будущий `system` turn (отдельная атомарность), не part of player turn critical path.

Имя extension point: `AfterCommitHook` (observe-only). Не путать с записью memory/summary в тот же player turn — такие commands должны попасть в draft **до** COMMIT (стадии PROPOSE/VALIDATE) либо в отдельный system turn инициированный host/runtime после успеха.

#### 11. END

- finalize turn trace → render `.md` → `TraceSinkPort.write` (commit **or** reject);
- release lock;
- return `TurnResult` to host.

Trace contents/policy: [13-turn-tracing.md](./13-turn-tracing.md).

## 4. TurnResult

```text
TurnResult =
  | {
      status: "committed"
      turnId
      passage: Passage
      stateRevision: number
      warnings?: string[]
    }
  | {
      status: "rejected"
      turnId
      failure: TurnFailure
      stateRevision: number   // unchanged
    }
```

## 5. Atomicity mode

**Only mode in v1: full-atomic turn.**

| Event | Result |
|-------|--------|
| Guard reject | no state change |
| Agent/LLM fail | no state change |
| Command validation fail | no state change |
| Narrative fail | no state change |
| Present fail | no state change |
| Persistence fail on commit | no state change |
| All critical stages ok | publish state+passage+journal together |

Config flag `atomicityMode` не нужен в v1 (значение зафиксировано).

Trade-off (принят сознательно): при флаках LLM игрок может получить reject и retry;
зато никогда не будет расхождения «мир уже другой, а текста/страницы нет».

## 6. Concurrency

- One active turn per `sessionId`.
- Concurrent submit → queue or `SESSION_BUSY` error (config).
- Cross-session parallelism ok.

## 7. Timeouts

Each stage has budget. On timeout:

- before commit → reject, state unchanged;
- after commit → fallback path + error log; never leave session lock hanging.

## 8. Idempotency

Host may retry with same `clientActionId`:

- if turn already committed for that id → return previous `TurnResult`;
- core stores idempotency key map per session (bounded).

## 9. Minimal path without optional modules

Even with zero domain modules:

1. accept noop/continue action;
2. advance turn counter;
3. produce fallback or bare narrative brief from core flags;
4. return passage.

This proves core loop independence.

## 10. Example: player talks to NPC

```text
NORMALIZE: free text → action{type: "speak", text}
INTENT: target npc:elena
GUARD: npc exists, canSpeak
PLAN: npc.intent for Elena + nearby witnesses
PROPOSE: relation delta, knowledge flags, inventory none
VALIDATE: dry-apply commands onto draft
NARRATE: brief from draft; if LLM fails → FULL ROLLBACK
PRESENT: choices [ask more, leave, ...]
COMMIT: publish state + passage + journal together
AFTER: metrics only
```

## 11. Extension map (summary)

На **каждой** стадии доступны generic interceptors: `before` / `after` / `onError`.

Плюс typed ports (неполный summary — полный список в [12-extension-surface.md](./12-extension-surface.md)):

| Stage | Typed ports (examples) |
|-------|------------------------|
| NORMALIZE | InputNormalizer, ActionClassifier, EntityResolver |
| INTENT | IntentContributor, IntentScorer, DisambiguationProvider |
| GUARD | Guard, SoftGuard, PrerequisiteChecker, ResourceCostEvaluator, PolicyRule |
| PLAN | Planner, SalienceProvider, AgentTaskContributor (+ AgentTools on demand) |
| PROPOSE | TransitionContributor, CommandDecorator |
| VALIDATE | CommandValidator, Invariant, ConflictResolver, DraftSimulator |
| NARRATE | NarrativeContextProvider, NarrativeStyleProvider, PromptFragmentProvider, BriefPolicy, NarrativeCritic |
| PRESENT | PassageAssembler, ChoiceContributor, ChoiceFilter, StatusPanelProvider |
| AFTER | AfterCommitHook, SystemTurnScheduler (schedule only) |

Catalog registrations (`registerCommand`, `registerSlice`, …) работают across stages and are the main way to add domain mechanics without new stages.

## 12. Non-goals for pipeline v1

- arbitrary DAG user-defined workflows;
- mid-turn player interaction multi-step wizard (можно эмулировать несколькими turns);
- parallel competing commits on one session.
