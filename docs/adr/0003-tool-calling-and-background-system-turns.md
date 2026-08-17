# ADR 0003 — Generic tool-calling agents + background system turns

## Status

Accepted (2026-08-17)

## Context

Product modules need post-narrative side effects driven by a **separate** LLM agent
(not `narrative.write`), including function/tool calls. The first consumer is the
player **character** module (outfit sync). The same platform mechanisms should unlock
inventory/NPC/etc. later.

Player-facing prose must not wait on optional maintenance agents.

## Decision

1. **Generic LLM tool loop** in core (`runToolCallingTask` + orchestrator path):
   - `LlmPort` carries `tools` / `toolCalls`
   - Registered `AgentTaskTypeDefinition.buildMessages` enables module tasks without a dedicated adapter
   - Tools never commit world state; they may write turn `extras` proposals
   - Modules map proposals → `StateCommand`s in `TransitionContributor`

2. **System turn schedule modes**:
   - `inline` (default): drain before returning player `TurnResult` (backward compatible)
   - `background`: return player passage first; run system turn when session is free
   - Next player action **waits** until background work finishes (serial session)

3. **System turns skip `narrative.write`** and use a short internal `(system) <reason>`
   passage for journal/trace only. They **do not** replace player-facing `lastPassage`
   and **do not** emit `passage.published`. Turn events carry `turnKind` so hosts can
   ignore system turns in chat UX.

4. **Character module** (`@rpengineext/module-character`):
   - Story JSON `character: { name, appearance, features, outfit }`
   - Narrative injection via `NarrativePromptContributor` (system section) + structured brief namespace
   - Background `character.outfit_sync` agent with tool `character.update_outfit`

## Consequences

- Optional maintenance cost after each free_text turn when character is present
- Outfit may lag by one background job if the player immediately acts (they wait)
- Responses API adapters must map function tools / function_call_output items
- Hosts must treat `turnKind !== "player"` as non-chat (no Narrator bubble, no busy hijack)
