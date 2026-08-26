# State & Commands (Atomic Turns)

> **Статус:** normative  
> **Ключевое требование:** ходы атомарны.

## 1. Terms

| Term | Definition |
|------|------------|
| `WorldState` | Авторитетный снимок мира на момент времени |
| `StateSlice` | Namespaced часть state (`core`, `npc`, `plot`, ...) |
| `StateCommand` | Единственная легальная операция изменения state |
| `TurnDraft` | Буфер команд и артефактов **до** commit |
| `JournalEntry` | Запись в append-only лог после успешного commit |
| `Snapshot` | Материализованный `WorldState` (+ meta) для быстрого load |

## 2. WorldState shape (logical)

```text
WorldState
  meta: { schemaVersion, revision, updatedAtTurnId }
  core: { turnIndex, clock, flags, passageCursor, ... }
  slices: {
    [moduleSliceName]: unknown  // validated by slice schema
  }
```

Правила:

- каждый module slice валидируется своей schema version;
- core не интерпретирует чужие slice’ы;
- read API даёт deep-frozen / readonly view на время turn.

## 3. StateCommand

Логическая структура:

```text
StateCommand {
  commandId: string           // unique in turn (uuid/ulid)
  type: string                // e.g. "npc.upsert", "core.setFlag"
  slice: string               // target slice
  payload: object             // schema-bound
  reason?: string             // audit/debug
  source: {
    kind: "module" | "agent" | "core" | "system"
    id: string
  }
}
```

### Command catalog

- Base commands живут в `contracts` (`core.*`).
- Module commands объявляются module schema и регистрируются при `register`.
- Незарегистрированный `type` = reject.

## 4. Atomic turn transaction model (full-atomic)

**Норматив:** любой fatal failure в ходе ⇒ откат ко входу хода. Полухода не существует.

```text
BEGIN_TURN(turnId)
  S0 = authoritative committed state
  draft = copy(S0)
  artifacts = {}

  run stages on draft only:
    normalize → intent → guard → plan → propose
    validate+dry-apply commands onto draft
    narrate (brief from draft) → passage artifact

  IF any fatal error in stages above:
     DISCARD draft + artifacts
     authoritative = S0  (unchanged)
     EMIT turn.rejected
     return

  COMMIT as one unit:
     authoritative state = draft
     store passage
     append journal
     durable persistence flush (bun:sqlite)
     EMIT turn.committed

  AFTER: observe-only hooks (cannot mutate truth; cannot uncommit)
END_TURN
```

### Гарантии

1. **Atomicity:** нет частично применённого turn к authoritative state **и** нет committed state без успешного passage на player turn.
2. **Isolation:** параллельные turn на одной session запрещены (queue/lock per session).
3. **Durability:** successful turn flushed through PersistencePort (`bun:sqlite` v1).
4. **Consistency:** invariants/guards + narrative/present success required before publish.

### Что входит в атомарную границу player turn

- все accepted `StateCommand` хода;
- turn index / revision meta;
- `Passage` (prose) linked to `turnId`;
- journal entry;
- sqlite flush этого turn unit.

### Что вне границы (best-effort AFTER)

- telemetry/metrics/UI events only;
- **запрещено** считать AFTER местом для обязательной записи world/memory.
  Нужные memory/summary commands — в draft до COMMIT или отдельный `system` turn.

## 5. Two-phase apply (рекомендуемый алгоритм kernel)

**Phase A — dry validation**

1. Start from committed state S0.
2. For commands in deterministic order:
   - validate schema;
   - check permission of source;
   - run command-specific validator against progressive draft;
   - apply to temporary draft S'.
3. Run global invariants on S'.

**Phase B — commit**

- If A ok: replace authoritative state with S', append journal, bump revision.
- Else: drop S', return rejection with reasons.

Это предотвращает «применили 5 команд, 6-я упала».

## 6. Deterministic ordering

Порядок apply:

1. `core.*` meta commands with reserved priority (documented).
2. module commands: contributors отсортированы по `(module.priority asc, registration order)`; kernel применяет команды в порядке предложения (proposal order).
3. Conflict policy: last-writer-wins **запрещён** silently.
   - Если два command конфликтуют на одном key path — нужен explicit resolver или reject turn.

Conflict detection минимальный v1:

- same slice key write conflict tags declared by command handlers;
- reject turn with `COMMAND_CONFLICT` unless module provides pure merge function registered for that key type.

## 7. Proposals vs commands

LLM/module planner часто выдаёт **Proposal**:

```text
Proposal {
  proposalId
  commands: StateCommand[]
  narrativeHints?: object
  confidence?: number
  explanations?: string
}
```

Pipeline:

1. schema-validate proposal;
2. rewrite/normalize to commands;
3. guards;
4. only then enter kernel dry-apply.

Proposal сам по себе state не меняет.

## 8. Writes that feel “post-narrative”

Because COMMIT is last, modules that need memory/summary in the same player turn must:

1. emit those `StateCommand`s into the **draft before COMMIT** (typically after plan/narrate inputs are known, still pre-commit), **or**
2. schedule a separate atomic `system` turn after successful player turn.

Narrative prose **не** является source of truth.

Факты → commands в draft; prose → описание draft/будущих фактов, которые уйдут в commit вместе.

## 9. Invariants (examples)

Глобальные (core):

- `revision` монотонен;
- `turnIndex` +1 на successful player turn;
- slice schema versions compatible.

Module examples:

- NPC target exists before relation modify;
- inventory qty ≥ 0;
- plot beat not active in two exclusive acts.

Invariants run on draft end-state before commit.

## 10. Rejection model

```text
TurnFailure {
  turnId
  code: "GUARD_REJECTED" | "INVALID_INPUT" | "COMMAND_INVALID" |
        "COMMAND_CONFLICT" | "AGENT_FAILED" | "TIMEOUT" | "INTERNAL" |
        "PERMISSION_DENIED" | "INVARIANT_FAILED" | "PRESENT_FAILED" |
        "PERSISTENCE_FAILED" | "AMBIGUOUS_TARGET" | "MODULE_ERROR" |
        "MODULE_*" (module-platform коды; author deny(code) проходит as-is)
  message                 // player-safe
  details?: unknown       // logs / dev
  causedBy?: string[]     // module/agent ids
  stage?: string          // stage id, если известен
}
```

При failure authoritative state = pre-turn.

Host может показать игроку message и предложить retry/rephrase.

## 11. Journal & replay

Journal entry (logical):

```text
JournalEntry {
  turnId
  prevRevision
  nextRevision
  input: PlayerAction
  commands: StateCommand[]   // accepted only
  passageId
  timestamp
}
```

Replay:

```text
S = initialSnapshot
for entry in journal:
  S = apply(S, entry.commands)  // must equal stored snapshots at checkpoints
```

Replay **не** переигрывает LLM. Prose хранится как артефакт passage record.

## 12. Passage record

```text
Passage {
  id
  turnId
  prose
  visibleState?: PublicView  // optional redacted projection
}
```

Passage immutable after commit.

## 13. Anti-patterns

- ❌ `state.slices.npc = ...` в handler.
- ❌ commit после каждой команды.
- ❌ «если narrative/LLM упал — state уже оставить».
- ❌ частичный commit команд внутри хода.
- ❌ хранить критичный факт только в vector memory.
- ❌ non-deterministic command order from object key enumeration without sort.

## 14. Minimal core command set (v1 draft)

| type | slice | purpose |
|------|-------|---------|
| `core.bumpTurn` | core | turnIndex++ |
| `core.setFlag` | core | boolean/enum flags |
| `core.clearFlag` | core | remove flag |
| `core.setClock` | core | world time |
| `core.setPassageCursor` | core | book pointer |

Domain commands — modules (`npc.*`, `plot.*`, `canon.*`, `memory.*`).
