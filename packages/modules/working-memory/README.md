# `@rpengineext/module-working-memory`

First product module: **working memory** for narrative continuity.  
Built with **`@rpengineext/module-sdk`** (`defineModule`).  
**Как писать свой модуль:** [`docs/modules/README.md`](../../../docs/modules/README.md) · рецепт: [`recipes.md` §2](../../../docs/modules/recipes.md#2-память-хода-afterprose--history) · [sdk-reference](../../../docs/modules/sdk-reference.md).

## What it does

- Stores **every** successful player `free_text` ↔ narrative prose **pair** in slice `working_memory` (unbounded).
- Injects the last **N pairs** into `narrative.write` as real chat `user`/`assistant` messages.
- Persists with the session snapshot (sqlite / in-memory) — no separate table.

## Config

| Source | Key |
|--------|-----|
| Env (host) | `RP_WORKING_MEMORY_WINDOW` — positive int, default `12` |
| `moduleConfig` | `working_memory: { windowPairs: number }` |

Factory and `moduleConfig` must use the **same** `windowPairs` value.

```ts
import {
  createWorkingMemoryModule,
  readWorkingMemoryWindowFromEnv,
} from "@rpengineext/module-working-memory";

const windowPairs = readWorkingMemoryWindowFromEnv(process.env);

await createEngine({
  modules: [createWorkingMemoryModule({ windowPairs })],
  config: {
    moduleConfig: {
      working_memory: { windowPairs },
    },
  },
  // ...
});
```

## SDK capabilities

- `narrative.history` + `brief` → last-N pairs for `narrative.write`
- `turn.afterProse` → `append_pair` op before COMMIT
- `host.readModels` → debug selectors

## Public contract

| Field | Value |
|-------|-------|
| id / version / priority | `working-memory` · `1.0.0` · 10 |
| provides / requires | `capability:working-memory` / — |
| slice | `working_memory` (schemaVersion 1) |
| meta keys (seed) | — (no seed) |
| config key | `working_memory: { windowPairs: number }` (env `RP_WORKING_MEMORY_WINDOW`) |
| readModels | `working_memory.window` (args: —), `working_memory.all` (args: —) |
| events | emitted: —; subscribed: — |
| system reasons / tasks / tools | — (no background system turns) |

## Non-goals (v1)

- No truncation of message text
- No system-turn pairs
- No history on `action.interpret`
- No summarizer / vector store
