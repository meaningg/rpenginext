# ADR 0004: Module SDK (CBMD) as the only author path

> **Status:** Accepted — **author path frozen at SDK 1.0.0** (Module Platform 1.0, 2026-08-26)
> **Date:** 2026-08-18

## Context

Module authors (especially external) were required to learn the engine extension surface
(catalogs A, interceptors B, typed ports C), manual manifests (`registers` /
`contributes` / `interceptors`), `Result` plumbing, and pure `WorldState` spreads.

That contradicted the product goal: **add gameplay without studying core**.

## Decision

1. **Single author path:** `@rpengineext/module-sdk` via `defineModule(...)`.
2. **CBMD:** a module is identity + closed **capability** kinds (state, seed, rules,
   turn, narrative, ai, host, config, access), with object-sugar desugaring into the
   same `capabilities[]` model.
3. **Foundation unit = IR + bindings + table-driven bind**
   - `defineModule` → `buildBindings` + `buildManifestAndIr` →
     `compiled.install = bindCompiledModule(ir, bindings)`.
   - **Bind is structural:** only `ir.moments` / `ir.slice.ops` / `ir.ai*` are installed;
     missing or extra bindings fail boot.
   - Core `ModuleRegistry` loads product modules via **`compiled.install`** only.
   - Authors never see IR, ports, or `ModuleRegisterContext`.
   - Contribution bus is engine-internal plumbing fed **from IR**, not an author API.
   - Deferred tool ops use **`ModuleOpProposal` protocol** (contracts extras keys),
     not ad-hoc bags.
   - `committed` runs once in AfterCommit; schedules drain via SystemTurnScheduler protocol.
   - Core-internal test fixtures may still use bare `register()`; that is **not**
     an external/author path.
4. **Compatibility policy:**
   - Authors peer on **`module-sdk`**, not core internals.
   - `MODULE_SDK_VERSION` / `MODULE_IR_VERSION` / capability catalog evolve by semver.
   - Additive optional capability fields/kinds = **minor**.
   - Remove/rename author API, IR break, or merge/invariants change = **major**.
   - Compat fixtures (`bun run test:compat`) guard sdk↔core on every change.
5. **Sacred runtime invariants unchanged:** full-atomic turns, commands as SoT,
   AI non-authoritative, module writes only own slice, `committed` cannot mutate world.

## Consequences

- First-party modules use sdk only; raw port registration is not an author guide path.
- IR is goldenable / inspectable (`module.ir`) for debug and compat CI.
- Docs: author path = `docs/modules/` (README + sdk-reference + recipes + schemas); `12-extension-surface` = maintainer/internal.
- Scaffold: `bun run create-module <id>`.
- Future pipeline refactors rebind IR install without author source changes; IR
  version bumps are explicit.

## Follow-ups

- **Moments-native core** (deferred direction): [ADR 0005](./0005-moments-native-core.md).
  Не реализовано; sdk IR bind ↔ ports bus остаётся load-bearing.

## Non-goals

- Open-ended third-party `.use(anyPlugin)` without a versioned capability kind.
- Exposing pipeline stage interceptors on the author surface in v1.

## Freeze note (SDK 1.0.0)

As of Module Platform 1.0 the author path is **frozen**:

- Capability kinds closed set (incl. `events`), lifecycle hooks `init`/`shutdown`
  normative — [specs/01](../specs/01-sdk-contract-freeze.md).
- Moment permissions table normative; changes = MAJOR
  ([compatibility.md](../modules/compatibility.md)).
- Author docs teach only `defineModule` + `@rpengineext/module-sdk/test`.
- IR stays fully serializable (JSON) for polyglot readiness (spec 00 §4.11).
- Post-release core-change rule: only bugfix / ADR / “cannot express in SDK” proof
  ([specs/07 §11](../specs/07-release-and-versioning.md)).
