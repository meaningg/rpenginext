# Story templates

Host loads every `*.json` in this directory (non-recursive) via
`@rpengineext/content-stories` (`RP_STORIES_DIR`, default `data/stories`).

## Tracked examples (public)

| File | Id | Purpose |
|------|----|---------|
| `demo.hello.json` | `demo.hello` | short smoke / mock / e2e opening turn |
| `demo.book.json` | `demo.book` | sandbox book with character + worldCanon |

These two files are **committed** so clone → `bun run api:mock` works out of the box.

## Private stories (local only)

Any other `*.json` you add here (campaigns, fandom drafts, personal content)
stays **gitignored**. Drop files next to the demos; the catalog picks them up
on the next host boot. Do not rename demos to hold private content — add a new id.

Schema: see `packages/content-stories` (`StoryTemplateSchema`).
