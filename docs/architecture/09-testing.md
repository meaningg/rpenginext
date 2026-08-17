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
| Integration | app | mock/optional live | boot modules, save/load |
| Live LLM (optional) | gated | yes | schema adherence smoke |

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

Core publishes (later implementation) `createTestRuntime({modules, mocks})` in a testing package or core/testing export:

- run single turn;
- inspect journal/commands;
- no network.

Authors must not need full app UI.

## 6. CI policy (target)

- PR: unit + contract + golden + replay.
- Live LLM: manual/nightly only.
- Coverage: not vanity 100%; critical kernel paths mandatory.

## 7. Non-flaky rules

- sort arrays before compare;
- freeze time/rng in tests via injected clock/rng;
- never assert on exact full LLM prose in unit tests.
