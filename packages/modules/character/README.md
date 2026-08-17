# `@rpengineext/module-character`

Player character module for story-driven RP.

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

## Pipeline

1. `SessionBootstrap` → `character.seed`
2. Player turn `NarrativeContextProvider` + `NarrativePromptContributor`
3. Player COMMIT → schedule `character.outfit_sync` (`mode: background`)
4. Return passage immediately
5. Background system turn: tool-calling agent → `character.set_outfit` if needed

## Non-goals (v1)

- Multiple characters / NPC wardrobe
- Outfit tools on the narrative agent
- Blocking outfit before passage delivery
