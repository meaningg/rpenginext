# Turn Tracing (Markdown debug traces)

> **Статус:** normative  
> **Где живёт:** **core** (не module)  
> **Зачем:** отладка, контроль AI, аудит «почему мир стал таким», разбор rollback.

## 1. Decision

Генерация подробных **turn traces в `.md`** — обязанность **core**.

Почему не module:

- должен видеть *весь* pipeline, kernel, orchestrator, tools;
- modules не имеют права читать чужие prompt/secrets без контроля;
- trace нужен даже при zero product-modules;
- единый формат = единый tooling/diff/CI.

Modules могут лишь **добавлять namespaced annotations** в trace (через core API), но не владеют форматом файла.

## 2. Player vs operator

| Audience | Sees |
|----------|------|
| Player | Passage / friendly errors only |
| Operator/dev | `.md` trace files (+ structured logs) |

Traces are **debug/control artifacts**, not game content and not source of truth.

## 3. When traces are written

| Turn outcome | Trace file |
|--------------|------------|
| committed | yes (full) |
| rejected / rolled back | yes (full up to failure + rollback marker) |
| session boot failures | optional engine trace (separate) |

**Important with full-atomic turns:**  
even if state rolls back to `S0`, the trace of the *attempt* is kept.  
That is how we debug LLM/tool failures without mutating world.

## 4. Core subsystem: `TurnTracer`

```text
core/tracing/
  turn-tracer.ts          # collects events during turn
  markdown-renderer.ts    # TurnTrace → .md string
  trace-sink.ts           # uses TraceSinkPort (fs default)
```

### Lifecycle

```text
BEGIN turn → tracer.open(turnId)
  each stage/agent/tool/command → tracer.record(...)
COMMIT or REJECT → tracer.finalize(outcome)
  → render markdown
  → TraceSinkPort.write(path, markdown)
  → emit observe event trace.written
```

Collection happens **in memory during turn**.  
Flush file at end of turn (success or fail), so partial files are avoided (or write `*.partial.md` only on hard crash policy).

## 5. Trace contents (maximum useful detail)

Каждый trace — один markdown-документ с стабильными heading’ами (для grep/tooling).

### 5.1 Header

- `traceFormatVersion`
- `sessionId`, `turnId`, `turnKind` (`player|system`)
- `startedAt` / `finishedAt` / `durationMs`
- `outcome`: `committed | rejected`
- `failure` (code, message, stage) if any
- `stateRevisionBefore` / `stateRevisionAfter` (after = before on reject)
- `enabledModules` (id@version)
- `configFingerprint` (hash of non-secret config)
- `atomicity`: `full`

### 5.2 Player input

- raw input
- clientActionId
- normalized action (JSON)
- final intent (JSON)
- guard decisions (pass/reject per guard id)

### 5.3 Stage timeline

Ordered table/list:

| # | stage | status | durationMs | notes |
|---|-------|--------|------------|-------|

Plus per-stage interceptor hits (module id, when=before/after, effect).

### 5.4 Agent calls (LLM)

For **each** `AgentTask`:

- taskId, type, requester (core/module id)
- model alias (not API key)
- constraints (timeout, temperature, repair attempts)
- **input payload** (structured JSON in fenced block)
- rendered prompt parts **if** `tracing.includePrompts=true` (default true in dev, configurable)
- raw model output (text/JSON)
- parsed/validated output
- repair attempts (each attempt: error + repaired output)
- token usage / latency
- status: ok/fail

Redaction rules apply (see §7).

### 5.5 Tool calls

For each tool invocation inside agent or core:

- toolName, callId, parent taskId
- arguments JSON
- result JSON / error
- durationMs
- permission check result

### 5.6 State changes

Always show:

1. **Proposed commands** (full list, with source)
2. **Validation results** per command (accept/reject reason)
3. **Applied command set** (only on commit path; on reject — “would-apply” dry-apply set if available)
4. **State diff** `S0 → draft/final`:
   - JSON patch style **or** before/after slices
   - at minimum: changed paths + new/old values
5. On reject: explicit `ROLLBACK to revision N (no authoritative changes)`

### 5.7 Narrative / passage

- NarrativeBrief (merged, by namespace)
- style/policy fragments summary
- critic results if any
- final Passage prose
- on reject: brief/prose partials if stage reached

### 5.8 Persistence

- sqlite transaction attempt: begin/commit/rollback
- rows/keys written (ids, not necessarily full blobs if huge — then hash + size)
- path to db / save id

### 5.9 Module annotations

Modules may call:

```text
turn.trace.note({
  namespace: "npc",
  title: "Salience",
  body: "...",
  data?: object
})
```

Rendered under `## Module notes` as subsections `### npc / Salience`.

No module can erase core sections.

### 5.10 Errors & warnings

- accumulated warnings
- stack/typed error details (dev)
- correlation ids

## 6. Markdown file layout (normative skeleton)

```markdown
# Turn trace `trn_...`

- session: `ses_...`
- outcome: **rejected** | **committed**
- ...

## Summary
...

## Input
...

## Timeline
...

## Agents
### Agent task `...` (`narrative.write`)
#### Input
```json
...
```
#### Output
```json
...
```
#### Repairs
...

## Tool calls
...

## Commands
...

## State diff
...

## Narrative
...

## Passage
...

## Persistence
...

## Module notes
...

## Warnings / errors
...
```

Stable H2 titles are part of the contract for external grepping.

## 7. Privacy, secrets, size limits

### Never written

- API keys, Authorization headers
- raw env secrets
- password-like config fields

### Configurable

```text
tracing: {
  enabled: boolean                 // default true in dev, config in prod
  directory: string                // e.g. ${dataDir}/traces
  includePrompts: boolean          // default true
  includeRawModelOutput: boolean   // default true
  includeFullStateSnapshots: boolean // default false; diffs default true
  maxStringFieldChars: number      // truncate with marker
  maxArrayItems: number
  redactKeys: string[]             // extra key names to mask
  writeOnReject: boolean           // default true
  writeOnCommit: boolean           // default true
}
```

### Truncation

Large prose/state fields truncate with:

```text
… [truncated 120000 → 20000 chars, sha256=...]
```

so trace stays openable in editors.

## 8. Storage & naming

Default path pattern:

```text
{tracing.directory}/{sessionId}/{turnIndex}_{turnId}_{outcome}.md
```

Example:

```text
data/traces/ses_01H.../00042_trn_01H..._rejected.md
```

Charset: UTF-8. Newline: `\n`.

Optional index file per session (non-normative helper):

```text
{tracing.directory}/{sessionId}/INDEX.md
```

## 9. Ports

```text
TraceSinkPort {
  write(input: { sessionId, turnId, relativePath, contents: string }): Promise<void>
  // optional:
  appendIndex?(...)
}
```

v1 impl: filesystem under data dir (CLI host wiring).  
Core depends only on port; fs adapter in app or small `packages/tracing-fs` if needed.

`TurnTracer` itself stays in **core**.

## 10. Event bus

Observe-only events:

- `trace.finalized` `{ turnId, outcome, path }`
- `trace.write_failed` `{ turnId, error }`

Failure to write trace:

- **must not** roll back an already decided turn commit outcome by default;
- **should** log error;
- config `tracing.failTurnOnWriteError` default **false**  
  (trace is diagnostics; world commit already succeeded).  
- For reject path, write failure only logs.

> Note: this does **not** weaken full-atomic gameplay state.  
> Trace I/O is outside world-state atomic boundary (by design).  
> If operator wants stricter coupling later — ADR.

## 11. Relation to structured logs

| | Logs | Turn `.md` trace |
|--|------|------------------|
| Format | JSON lines / levelled | human-readable markdown report |
| Unit | event | whole turn dossier |
| Use | runtime monitoring | post-mortem, AI control, PR fixtures |

Both exist. Trace is the **narrative of one turn**; logs are stream.

## 12. Testing requirements

Core tests must cover:

1. committed turn creates md with commands + diff sections;
2. rejected LLM turn creates md with outcome rejected + rollback note + agent output/error;
3. secrets never appear even if passed in config shadow object;
4. module `trace.note` appears under module notes;
5. truncation markers when over limit.

Golden tests may snapshot markdown with normalized timestamps/ids.

## 13. Non-goals v1

- binary GUI replay viewer;
- sending traces to third-party SaaS by default;
- using traces as reloadable source of truth (journal/state are SoT);
- auto-uploading player stories.

## 14. Implementation phase

- Phase 2: in-memory tracer + md render + sink mock (tests)
- Phase 3: fs sink next to bun:sqlite data dir; enable in CLI default dev profile
