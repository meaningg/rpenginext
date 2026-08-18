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

Published:

- **`@rpengineext/core/testing`** — `createTestEngine({ modules, moduleConfig, … })`
- **`@rpengineext/module-sdk/test`** — optional `testModule` harness
- Compat gate: `bun run test:compat` (frozen sdk fixtures vs current core)

Typical module test (≥3: success / reject / edge):

```ts
import { createTestEngine } from "@rpengineext/core/testing";
import { createMyModule } from "../src/index.ts";

const created = await createTestEngine({
  modules: [createMyModule()],
});
// startSession → submitAction → assert TurnResult / state slice / mod.ir
```

Authors must not need full app UI. Production dep: **module-sdk** only; `core` = devDependency.

## 6. CI policy (target)

- PR: unit + contract + golden + replay + mock e2e + **`test:compat`**.
- Live LLM: manual/nightly only (`bun run test:e2e:live`, `smoke:play:live`).
- Coverage: not vanity 100%; critical kernel paths mandatory.

## 7. Non-flaky rules

- sort arrays before compare;
- freeze time/rng in tests via injected clock/rng;
- never assert on exact full LLM prose in unit tests;
- do not require private story templates — only tracked examples (`demo.hello`, `demo.book`).
