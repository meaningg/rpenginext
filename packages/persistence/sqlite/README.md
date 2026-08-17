# `@rpengineext/persistence-sqlite`

`bun:sqlite` implementation of `PersistencePort` for rpengineext.

## Features

- Session snapshot upsert
- Append-only journal
- **Atomic** `commitTurn({ snapshot, journalEntries })` via SQLite transaction
- WAL mode for file databases

## Usage

```ts
import { SqlitePersistence } from "@rpengineext/persistence-sqlite";

const persistence = await SqlitePersistence.open({
  dataDir: "data",
  // databaseFile: "data/rpengine.sqlite", // optional
});

// inject into createEngine({ deps: { persistence, ... } })
```

## Tests

```bash
bun test packages/persistence/sqlite
```
