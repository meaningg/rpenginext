# Persistence

> **Статус:** normative

## 1. Goals

- сохранить кампанию/сессию между запусками;
- уметь replay journal для отладки и проверки детерминизма apply;
- не привязывать core к конкретной БД.

## 2. Port

```text
PersistencePort {
  save(snapshot: SessionSnapshot): Promise<void>
  load(sessionId: string): Promise<SessionSnapshot | null>
  appendJournal(sessionId: string, entries: JournalEntry[]): Promise<void>
  readJournal(sessionId: string, fromRevision?: number): Promise<JournalEntry[]>
  delete?(sessionId: string): Promise<void>
  list?(filter?): Promise<SessionMeta[]>
}
```

Implementations live outside core. **v1 driver: `bun:sqlite`** (package `packages/persistence/sqlite`).
Later remote drivers possible behind the same port.

## 3. SessionSnapshot (logical)

```text
SessionSnapshot {
  formatVersion: number
  sessionId: string
  createdAt: string
  updatedAt: string
  engine: { coreVersion, contractsVersion }
  enabledModules: { id, version }[]
  state: WorldState
  lastPassageId?: string
  passages?: Passage[] | PassageStoreRef
  idempotency?: Record<clientActionId, turnId>
  meta?: object
}
```

## 4. Save policies

| Policy | Behavior |
|--------|----------|
| `per_turn` | flush snapshot+journal as part of turn COMMIT unit |
| `manual` | host calls save |
| `interval` | debounced |

v1 default for local single-player: `per_turn` via **bun:sqlite**.

### SQLite turn unit

Successful COMMIT must not leave divergent memory vs DB:

1. write journal + snapshot (+ passage) in one sqlite transaction;
2. only then publish in-memory authoritative pointer to new revision;
3. on sqlite failure → turn rejected, memory stays at `S0`.

## 5. What is stored vs recomputed

| Stored | Recomputed |
|--------|------------|
| WorldState snapshot checkpoints | module ephemeral caches |
| Journal accepted commands | agent raw prompts (optional debug store) |
| Passage prose | capability graph (from manifests at boot) |
| module list+versions | — |

## 6. Migration

- `formatVersion` on snapshot.
- migrations in persistence package, pure functions.
- module slice `schemaVersion` migrations provided by module (`migrate(old)→new`) and invoked by kernel/load procedure when versions differ.

If module missing on load:

- fail load **or** load in degraded mode if slice can be parked inert (config; default fail for safety).

## 7. Replay tool (dev)

CLI/dev command:

```text
replay --session <id> --to-revision <n> --verify-snapshots
```

Uses only journal commands + initial snapshot. Must match committed state.

## 8. Privacy

- save files may contain story content and user inputs;
- no provider API keys in snapshots;
- host documents save location.
