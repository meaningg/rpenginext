# Agents (LLM Layer)

> **Статус:** normative  
> **Роль LLM:** писать историю и помогать «управлять» NPC через proposals, не владеть state.

## 1. Player-facing promise

Игрок ощущает:

- живой текст истории каждый ход;
- NPC с характерами, целями, реакциями;
- пошаговый RP loop.

Технически:

- **NarrativeAgent** рендерит prose **после** (или на основе зафиксированного) plan/commit policy;
- **NPC agents/tools** предлагают поведение и реплики как structured data;
- core/modules решают, что из этого стало фактом мира.

## 2. Orchestrator is the only door

Все LLM-вызовы идут через `AgentOrchestrator` в core.

Почему:

- единый budget/timeout/concurrency;
- единый audit;
- единая schema validation + repair;
- modules не тащат API keys и vendor SDK вразнобой;
- проще менять provider без правок modules.

**Ban:** module напрямую зовёт OpenAI/Anthropic/etc.

## 3. AgentTask

```text
AgentTask {
  taskId: string
  type: string                 // "narrative.write" | "npc.voice" | "npc.intent" | ...
  turnId: string
  input: object                // schema by type
  outputSchema: JsonSchema     // or shared zod id
  constraints: {
    timeoutMs: number
    maxRepairAttempts: number
    temperature?: number
    tools?: string[]           // AgentTool ids allowed
  }
  requester: { kind: "core" | "module"; id: string }
}
```

### AgentResult

```text
AgentResult =
  | { ok: true; taskId; data: unknown; usage?: TokenUsage; rawMeta?: ... }
  | { ok: false; taskId; error: AgentError }
```

`data` должен пройти `outputSchema`, иначе repair или fail.

## 4. Standard task types (v1)

| type | Когда | Output (смысл) | Меняет state? |
|------|--------|----------------|---------------|
| `narrative.write` | narrate stage | prose + optional choice drafts | нет напрямую; fail ⇒ rollback turn |
| `action.interpret` | normalize/intent | structured player intent | no |
| `npc.intent` (example) | plan | intended actions per active NPC | через later commands |
| `npc.voice` (example) | narrate/plan | line/tone for NPC | no |
| `canon.query` (example) | plan/validate | retrieved notes / contradictions | no |
| `summary.compress` (example) | pre-commit draft or system turn | memory candidates | via memory commands |

Modules могут добавлять task types, если:

- объявили в manifest `provides: agent-task:...`;
- есть adapter routing в host config;
- permissions `agent:call:<type>` выданы.

## 5. Narrative vs authority split (full-atomic)

```text
1) modules+agents prepare proposals/commands into DRAFT
2) validate dry-apply on draft
3) NarrativeBrief built from DRAFT state + context providers
4) narrative.write produces prose; on failure → FULL TURN ROLLBACK
5) choices/passage assembled in artifacts
6) single COMMIT publishes state + passage + journal together
```

Плюсы: игрок никогда не оказывается в мире, где facts уже сдвинулись, а страницы книги нет.  
Минусы: флейк LLM = отклонённый ход и retry (accepted trade-off).

Soft-commit loop (narrative invents extra facts mid-flight) — **not v1**, only via future ADR.

## 6. NPC “management” model

«LLM управляет NPC» = multi-step, не god-mode:

1. `npc` module selects relevant NPC set for turn (salience).
2. Orchestrator runs `npc.intent` (batch or per-NPC by budget).
3. Output → `TransitionContributor` maps to `npc.*` / world commands.
4. Guards (plot/canon/npc) filter illegal intent.
5. Commit.
6. `npc.voice` + narrative writer dramatize **draft-accepted** outcomes; publish only if narrative+commit succeed.

NPC memory/personality live in `npc` slice (and memory items), not in free chat logs only.

## 7. Prompt inputs must be engineered projections

Agents never receive entire raw DB dump blindly.

`NarrativeContextProvider` / module compilers build:

- who is present;
- known facts allowed to mention;
- secrets forbidden to leak;
- tone/rating constraints;
- last N passages or summary memory;
- accepted command outcomes this turn (after commit policy).

This is how canon control stays strict.

## 8. Schema validation & repair

```text
call adapter
  → parse JSON
  → validate schema
  → if fail && attempts left: repair prompt with errors
  → else fail task
```

Fatal agent failure policy:

- **required task (default for narrative & gameplay agents):** `fail_turn` + full rollback to `S0`;
- **optional task only if explicitly marked:** `skip_optional`;
- **fallback passage while keeping state:** запрещён в v1.

## 9. Budget & concurrency

Config-driven:

- `maxParallelAgentCallsPerTurn`
- `maxTokensPerTurn`
- `maxAgentWallTimeMsPerTurn`
- per-task timeouts

Orchestrator may cancel optional tasks if budget exhausted; required tasks fail turn.

## 10. Tools

`AgentTool` — module-provided function the model can call during a task:

- must be pure or externally compensated;
- must not commit world state;
- results become tool messages inside same task;
- permissioned and allowlisted per task type.

Example: `fandom-canon.search(query) → passages[]`.

## 11. Provider adapters

```text
contracts: LlmPort / AgentAdapter
adapters: openai-compatible, etc. (outside core)
```

Adapter responsibilities:

- map AgentTask → vendor request;
- return text/JSON + usage;
- surface rate limit/timeouts as typed errors.

No business logic in adapters.

## 12. Safety & content policy hooks

Host may inject:

- input moderation pre-call;
- output moderation post-call;
- rating profile (G/R/etc.) into brief.

Failures = reject artifact / fail turn per config. Not silent strip without audit.

## 13. Testing agents

- Default tests mock orchestrator.
- Contract tests: sample outputs validate schemas.
- Golden tests freeze fixtures for proposal→commands mapping.
- Live LLM tests optional, gated by env, not required for CI core.

## 14. Audit fields (no secrets)

Structured log (stream):

- task type, ids, latency, tokens, repair count, ok/error code;
- module requester;
- model alias from config (not API key).

Turn markdown trace (dossier, core `TurnTracer`):

- full task input/output (subject to tracing config);
- prompts if `tracing.includePrompts`;
- each repair attempt;
- nested tool calls + results.

See [13-turn-tracing.md](./13-turn-tracing.md).

Never write API keys. Extra redact keys via config.
