# Testing Strategy

> **Статус:** normative

## 1. Goals

- core atomicity never regresses;
- modules can be tested without live LLM;
- independent authors get a clear quality bar.

## 2. Test layers

| Layer | Where | LLM | Focus |
|-------|-------|-----|-------|
| Unit | core, modules | mock | handlers, validators, command apply |
| Contract | modules ↔ contracts | no | manifest, permissions, schemas |
| Pipeline golden | core | mock orchestrator | input→commands→state→passage |
| Replay | persistence | no | journal apply determinism |
| Integration | app / host-bootstrap | mock/optional live | boot modules, save/load, HTTP |
| Live LLM (optional) | gated (`test:e2e:live`, smoke) | yes | schema adherence smoke |

## 3. Minimum bar (project rule aligned)

Для каждого нового **service/handler group** модуля:

1. success path;
2. error/reject path;
3. edge/boundary case.

Для core kernel:

- commit success;
- validation failure rolls back;
- conflict reject;
- concurrent turn busy/queue behavior.

## 4. Golden turn tests

Fixture format:

```text
given:
  modules: [...]
  initialState: ...
  action: ...
  agentMocks: { taskType: fixedOutput }
expect:
  status: committed|rejected
  commands: [...]
  stateMatches: ...
  passageContains?: ...
```

Goldens are the safety net for “core stable, modules evolve”.

## 5. Module test harness

Author guide: [../modules/README.md](../modules/README.md) (§ тесты).  
Platform bar: [../specs/02-testing-harness-stress-ci.md](../specs/02-testing-harness-stress-ci.md).

### Author SoT (required path)

**`@rpengineext/module-sdk/test`** — primary author harness:

- `testModule` / `testModules` (multi-module)
- `turn` / `action` / `systemTurn` / `waitIdle`
- `save` / `load`, slice helpers, asserts
- `fixedProseLlm` / `scriptedToolLlm`

Typical module test (≥3: success / reject / edge):

```ts
import { describe, expect, test } from "bun:test";
import {
  testModule,
  expectCommitted,
  expectRejected,
} from "@rpengineext/module-sdk/test";
import { createMyModule } from "../src/index.ts";

describe("my-module", () => {
  test("success", async () => {
    const t = await testModule(createMyModule());
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const turn = await t.value.turn("смотрю вокруг");
    expectCommitted(turn);
  });
});
```

### Advanced / maintainer escape

- **`@rpengineext/core/testing`** — `createTestEngine({ modules, … })` for core/pipeline fixtures and cases the harness does not cover yet.
- Authors should **not** need this for normal module work once Platform 1.0 harness DoD is green.

### Gates

| Script | Role |
|--------|------|
| `test:compat` | frozen sdk fixtures ↔ current core (**required** on sdk/core PRs; dual-path guard until ADR 0005) |
| `test:modules-stress` | N≥30 noop multi-module + S-cases (Platform 1.0) |
| `test:module-boundaries` | no module→module runtime deps |
| `test:scaffold-smoke` | all create-module recipes |
| `test:platform` | compat + stress + core + first-party |
| `test:e2e` / `smoke:play:mock` | host mock path |

*Scripts beyond `test:compat` / package tests are Platform 1.0 deliverables — see specs/02 and specs/07.*

Authors must not need full app UI. Production runtime dep: **module-sdk** + **zod**; `core` = devDependency only.

## 6. CI policy (target)

- PR (sdk/core/modules): unit + contract + golden + **`test:compat`**; platform scripts as they land.
- Release / `test:platform` gate: full sequence in [specs/07](../specs/07-release-and-versioning.md).
- Live LLM: manual/nightly only (`bun run test:e2e:live`, `smoke:play:live`) — **not** a tag blocker.
- Coverage: not vanity 100%; critical kernel + atomicity + author error codes mandatory.

## 7. Non-flaky rules

- sort arrays before compare;
- freeze time/rng in tests via injected clock/rng;
- never assert on exact full LLM prose in unit tests;
- do not require private story templates — only tracked examples (`demo.hello`, `demo.book`).
