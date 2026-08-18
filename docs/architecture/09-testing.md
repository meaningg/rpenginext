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

Published today: **`@rpengineext/core/testing`**.

Primary entry:

- `createTestEngine({ modules, mocks, … })` — in-memory persistence, mock agents, no network
- helpers: `createFixtureHelloModule`, `MemoryTraceSink`, `InMemoryPersistence`, `createDefaultMockAgentScript`

Typical module test:

```ts
import { createTestEngine } from "@rpengineext/core/testing";
import { createMyModule } from "../src/index.ts";

const bundle = await createTestEngine({
  modules: [createMyModule()],
});
// submitAction → assert TurnResult / state slice
```

Authors must not need full app UI. Use `core` as **devDependency** only.

## 6. CI policy (target)

- PR: unit + contract + golden + replay + mock e2e.
- Live LLM: manual/nightly only (`bun run test:e2e:live`, `smoke:play:live`).
- Coverage: not vanity 100%; critical kernel paths mandatory.

## 7. Non-flaky rules

- sort arrays before compare;
- freeze time/rng in tests via injected clock/rng;
- never assert on exact full LLM prose in unit tests;
- do not require private story templates — only tracked examples (`demo.hello`, `demo.book`).
