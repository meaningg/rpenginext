# `@rpengineext/module-working-memory`

First product module: **working memory** for narrative continuity.

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

## Pipeline hooks

- `NarrativeContextProvider` → namespace `working_memory` with `history` (core lifts into LLM messages).
- `PostNarrativeContributor` → `working_memory.append_pair` after passage is built, before COMMIT.

## Non-goals (v1)

- No truncation of message text
- No choice/system pairs
- No history on `action.interpret`
- No summarizer / vector store
