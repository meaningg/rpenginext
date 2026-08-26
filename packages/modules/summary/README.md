# `@rpengineext/module-summary`

Story **summary** module for long campaigns.  
Built with **`@rpengineext/module-sdk`** (`defineModule`) — pure module, no core changes.  
**Как писать свой модуль:** [`docs/modules/README.md`](../../../docs/modules/README.md) · [sdk-reference](../../../docs/modules/sdk-reference.md).

## What it does

- Every **N** player free-text turns it schedules a **background system turn**
  (`turn.committed` → `scheduleSystem({ mode: "background" })` → `ai.tasks.make`
  → tool `summary.store` → `store_summary` op).
- The task receives the **entire current working memory** (full archive) plus the
  previous chunks as context, but writes a **delta chunk** covering exactly the
  turns not yet summarized — chunks tile the history without gaps or duplicates.
- **All** chunks are stored in slice `summary` and injected into the narrative
  system prompt (`STORY SUMMARY`, chronological), so the LLM stays consistent
  on long campaigns: recent turns live in the working-memory window, older
  turns live in the chunks.

## Why the interval defaults to the working-memory window

The module has **no independent default**: the interval always follows the
working-memory window variable (`RP_WORKING_MEMORY_WINDOW`, same as
`module-working-memory`). With `interval == window` the no-gap guarantee holds
by construction: a turn leaves the prompt window only after it is already
covered by a chunk. If you override `intervalTurns`, keep
`interval <= window + 1`.

## How the chunk range is computed (no LLM guessing)

- `turn.committed` sees the **pre-turn** state snapshot, so the module rebuilds
  the current turn's pair from `action` + `passage.prose` (same fields/guards as
  `module-working-memory`) — the chunk at turn N covers working memory N.
- The tool `summary.store` receives **only the summary text**; the chunk range
  (`fromPairIndex..toPairIndex`) is computed by the handler from the actual
  working-memory state at system-turn execution time. The LLM never decides
  coverage, so chunks stay contiguous even after retries.

## Config

| Source | Key |
|--------|-----|
| Env (host) | `RP_WORKING_MEMORY_WINDOW` — interval defaults to this (no own default) |
| Factory | `createSummaryModule({ intervalTurns })` — explicit override |
| `moduleConfig` | `summary: { intervalTurns: number }` |

## Public contract

| Field | Value |
|-------|-------|
| id / version / priority | `summary` · `1.0.0` · 30 |
| provides / requires | `capability:summary` / — (читает `working_memory` slice via `access.read`, без package dep) |
| slice | `summary` (schemaVersion 1) |
| meta keys (seed) | — |
| config key | `summary: { intervalTurns: number }` (default: `RP_WORKING_MEMORY_WINDOW`) |
| readModels | `summary.list` (args: —) |
| events | emitted: —; subscribed: — |
| system reasons / tasks / tools | reason `summary.make` · task `summary.make` · tool `summary.store` |

```ts
import { createSummaryModule } from "@rpengineext/module-summary";
import { createWorkingMemoryModule } from "@rpengineext/module-working-memory";

await createEngine({
  modules: [
    createWorkingMemoryModule({ windowPairs: 12 }),
    createSummaryModule(), // interval = 12 (working-memory window)
  ],
  // ...
});
```

## SDK capabilities

- `turn.committed` → schedule background `summary.make` system turn when due
- `access.read: ["working_memory"]` → full archive as context
- `ai.tasks.make` + `ai.tools.store` → delta chunk via tool-calling agent
- `narrative.system` → all chunks, one `STORY SUMMARY` section
- `host.status` / `host.readModels["summary.list"]` → debug surface

## Non-goals (v1)

- No vector store / semantic recall
- No truncation of chunks (prompt grows with history by design)
- No rewriting of old chunks (previous chunks are only context)
- Chunk text is produced by the LLM; failures are tolerated (`optional: true`)
  and the next due turn retries
