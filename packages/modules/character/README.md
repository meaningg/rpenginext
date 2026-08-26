# `@rpengineext/module-character`

Player character module for story-driven RP.  
Built with **`@rpengineext/module-sdk`** (`defineModule`).  
**Как писать свой модуль:** [`docs/modules/README.md`](../../../docs/modules/README.md) · рецепт AI: [`recipes.md` §6](../../../docs/modules/recipes.md#6-ai--фоновый-system-turn) · [sdk-reference](../../../docs/modules/sdk-reference.md).

## What it does

- Seeds PC from story JSON `character: { name, appearance, features, outfit }`
- Injects character into `narrative.write` **system** prompt (via `NarrativePromptContributor`) + structured brief namespace
- After each player free_text turn, runs a **background** system turn with a tool-calling agent `character.outfit_sync`
- Agent receives **this turn's** `userText` + narrative `prose` and may call tool `character.update_outfit`
- Outfit is always **one string**; task is **optional** and does not block player-facing prose

## Story template

```json
{
  "character": {
    "name": "Alex",
    "appearance": "tall, dark hair",
    "features": "scar on left brow",
    "outfit": "black leather jacket, jeans, heavy boots"
  }
}
```

Host must put this object on `session.meta.character` (API does this from the template).

## Capabilities used

1. `seed` from `meta.character` → op `seed`
2. `narrative.system` + `brief`
3. `turn.committed` → `scheduleSystem(outfit_sync, background)`
4. `ai.tasks.outfit_sync` + `ai.tools.update_outfit` → op `set_outfit`
5. `host.status`

## Public contract

| Field | Value |
|-------|-------|
| id / version / priority | `character` · `1.0.0` · 20 |
| provides / requires | `capability:character` / — |
| slice | `character` (schemaVersion 1) |
| meta keys (seed) | `meta.character: { name, appearance, features, outfit }` |
| config key | `character` (schema) |
| readModels | — |
| events | emitted: —; subscribed: — |
| system reasons / tasks / tools | reason `character.outfit_sync` · task `character.outfit_sync` · tool `character.update_outfit` |

## Non-goals (v1)

- Multiple characters / NPC wardrobe
- Outfit tools on the narrative agent
- Blocking outfit before passage delivery
