# `@rpengineext/module-world-canon`

Static world-canon module for story-driven RP.

Built with **`@rpengineext/module-sdk`** (`defineModule`).  
**Как писать свой модуль:** [`docs/modules/README.md`](../../../docs/modules/README.md) · рецепт: [`recipes.md` §1](../../../docs/modules/recipes.md#1-seed--system-prompt) · [sdk-reference](../../../docs/modules/sdk-reference.md).

## What it does

- Seeds canon text from story JSON `worldCanon: string`
- Injects canon into `narrative.write` **system** prompt
- Marks presence in narrative brief namespace `world_canon`

## Story template

```json
{
  "worldCanon": "Magic is illegal in the city-state of Harbor."
}
```

Host puts this string on `session.meta.worldCanon`.

## Non-goals (v1)

- Mid-session canon mutation
- RAG / canon.search
- Contradiction guards against player actions
