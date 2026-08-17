# `@rpengineext/module-world-canon`

Static world-canon module for story-driven RP.

## What it does

- Seeds canon text from story JSON `worldCanon: string`
- Injects canon into `narrative.write` **system** prompt via `NarrativePromptContributor`
- Also marks presence in narrative brief namespace `world_canon` (no full-text duplicate)
- Canon is immutable after session bootstrap (v1)

## Story template

```json
{
  "worldCanon": "Magic is illegal in the city-state of Harbor. The Empire never fell; it just changed letterhead."
}
```

Host must put this string on `session.meta.worldCanon` (API does this from the template).

## Pipeline

1. `SessionBootstrap` → `world_canon.seed`
2. Each player turn: `NarrativePromptContributor` + `NarrativeContextProvider`
3. Core assembles compiled sections into the narrative system/user messages (no raw brief dump)

## Non-goals (v1)

- Mid-session canon mutation
- RAG / canon.search
- Contradiction guards against player actions
