# Stress suite — Module Platform 1.0 (specs/02 §5.4)

## Coverage

| Case | File | Expect |
|------|------|--------|
| S01 | boot.test.ts | boot N=30 no-op modules ok |
| S02 | boot.test.ts | duplicate module id → `MODULE_ID_DUPLICATE`, ids in message |
| S03 | boot.test.ts | duplicate slice → `MODULE_SLICE_DUPLICATE` |
| S04 | boot.test.ts | missing requires (strict default) → `MODULE_REQUIRES_MISSING` |
| S05 | order-writes.test.ts | 5 modules op own slices → all committed |
| S06 | order-writes.test.ts | A cannot write B slice → fail; B unchanged |
| S07 | order-writes.test.ts | `access.read` foreign in narrative ok |
| S08 | order-writes.test.ts | narrative section order priority-deterministic |
| S09 | background.test.ts | 2× `scheduleSystem` background; player ok; `waitIdle`; no corruption |
| S10 | save-load.test.ts | save/load ≥10 slices → roundtrip equality |
| S11 | background.test.ts | tool `proposeOp` in system turn; no partial leak on deny |
| S12 | order-writes.test.ts | moduleConfig invalid → `CONFIG_INVALID` (E07) |
| S13 | moments-readmodel.test.ts | `ctx.op` in `committed` → `MODULE_MOMENT_OP_FORBIDDEN`; world unchanged |
| S13b | moments-readmodel.test.ts | `ctx.op` in narrative (mid-turn) → turn rejected E15 |
| S14 | moments-readmodel.test.ts | unknown `ctx.readModel` → `MODULE_READ_MODEL_UNKNOWN` (change + narrative) |
| S14c | moments-readmodel.test.ts | readModel args schema fail → `MODULE_READ_MODEL_ARGS_INVALID` |
| S15 | events.test.ts | fan-out: one emit → 30 subscribers; payload intact |
| S16 | events.test.ts | `ctx.emit` in turn.change → turn rejected `MODULE_EVENT_EMIT_FORBIDDEN` |
| S17 | events.test.ts | subscriber `op`/`deny` in dispatch → fail-loud; world unchanged |
| S18 | events.test.ts | subscribe unknown name (publisher loaded) → boot fail `MODULE_EVENT_UNKNOWN` |
| S18b | events.test.ts | subscribe to unloaded publisher (no requires) → boot ok + inert |
| S19 | background.test.ts | pending scheduled system turns survive save/load and drain after load |
| S20 | events.test.ts | subscriber throw post-commit → turn committed; warning |
| S21 | lifecycle.test.ts | init fail → `MODULE_INIT_FAILED`; shutdown error → warning; ordering; init write fail-loud; harness stop |
| S22 | events.test.ts | cascade depth cap / burst cap → limits; world unchanged |

## Perf tripwires (P01–P04)

Recorded on a local CI-class machine (Windows, Bun 1.3). Bounds include ≥3× headroom;
fail only on pathological regression. Re-baseline only with an explicit PR note.

| ID | Case | Bound (ms) |
|----|------|------------|
| P01 | Boot N=30 | 5 000 |
| P02 | One mock turn, N=30 empty handlers | 5 000 |
| P03 | Boot N=100 (events declared) | 15 000 |
| P04 | One mock turn, N=100 handlers + fan-out | 15 000 |

## Run

```bash
bun run test:modules-stress
```