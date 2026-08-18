# ADR 0005: Moments-native core runtime (deferred)

> **Status:** Accepted (direction only) — **implementation deferred**  
> **Date:** 2026-08-18  
> **Depends on:** [ADR 0001](./0001-contracted-pipeline.md) (CPA), [ADR 0004](./0004-module-sdk-cbmd.md) (Module SDK / IR)  
> **Does not change:** author API (`defineModule` / CBMD), atomic turns, AI non-authoritative model

## 1. Context

### What we have today (post ADR 0004)

```text
Author:  defineModule({ moments via capabilities })
   → SDK:  CompiledModuleIR + bindings
   → bindCompiledModule(ir, bindings)
   → Core: ContributionIndex (typed ports A/B/C)
   → TurnPipeline stages call ports
```

- **Authors** already think in **moments** (`seed`, `guard`, `change`, `afterProse`, `committed`, …).
- **Core pipeline** still executes via a **wide ports bus** (`Guard`, `TransitionContributor`,
  `PostNarrativeContributor`, `SystemTurnScheduler`, …) from
  [12-extension-surface.md](../architecture/12-extension-surface.md).
- `bindCompiledModule` is a **correct, structural adapter**: IR moments → ports.
  It is not a fake foundation for modules; it *is* the module foundation.

### Why this ADR exists

The adapter is **necessary debt of the core shape**, not of the author path.

Long-term costs of keeping ports as the *only* runtime vocabulary inside core:

1. **Two dictionaries** forever: author/IR moments vs pipeline ports (Guard ≠ guard, etc.).
2. **`bindCompiledModule` grows** with every new port/moment mapping.
3. Temptation to **expose ports again** “for power users” and break ADR 0004.
4. Harder onboarding for **core maintainers** (must learn ports + moments + bind map).

This ADR records the **intended end-state** so it is not lost: optionally evolve **core**
to be moments-native, without rewriting modules.

## 2. Decision (direction)

### Accepted now

1. **Do not** implement moments-native core in the current delivery.
2. **Do** treat the following as the **target architecture** when core internals are next refactored.
3. **Module SDK author API and IR stay stable**; any core rewrite must keep
   `defineModule` / `CompiledModuleIR` / compat fixtures green (or bump IR with dual-load).

### Target end-state (when implemented)

```text
Author:  defineModule  (unchanged)
   → SDK:  IR + bindings  (unchanged or thinner)
   → Core: MomentRegistry holds bindings keyed by moment
   → TurnPipeline stages invoke moments directly
```

Ports bus (`ModuleRegisterContext` add*/register* as the *module* install surface)
becomes either:

- **deleted** for product modules, or  
- reduced to a **private** implementation detail of a thin compatibility shim during migration.

### What “moments-API” means

**Moments** = closed set of author-meaningful turn/session hooks already reflected in IR:

| Moment (IR / sdk) | Role | Truth mutation |
|-------------------|------|----------------|
| `seed` | new game bootstrap commands | via init transaction |
| `guard` / `soft` / `invariant` | legality | reject / warn / reject |
| `change` | state before narrative | commands (draft) |
| `narrativeSystem` / `narrativeUser` / `brief` / `history` / `style` | feed narrator | read-only (+ brief) |
| `afterProse` | state after prose known | commands pre-commit |
| `committed` | observe + schedule system turns | **no** world write |
| `rejected` / `load` | observe / hydrate | no world write |
| `hostStatus` / `hostHelp` / readModels | host surfaces | no world write |
| AI tasks/tools | orchestrated agents | tools → op proposals only |

**Moments-native core** means the pipeline’s public internal API is these moments
(plus catalogs: slice/ops/tasks), not forty port class names.

## 3. Non-goals

- Changing `defineModule` / CBMD capabilities for authors.
- Requiring third-party modules to migrate source.
- Replacing CPA (atomic turn, draft, single commit) — only the **extension invocation** layer.
- Open-ended event bus or freeform hooks (“any string stage”).
- Implementing this rewrite “by the way” without a dedicated task.

## 4. Mapping reference (today’s adapter)

Keep this table when implementing; it is the current bind map (sdk → ports):

| IR moment / catalog | Port / registration today |
|---------------------|---------------------------|
| `slice` + `ops` | `registerSlice` / `registerCommand` |
| `configKey` | `registerConfigSchema` |
| `seed` | `SessionBootstrap` |
| `guard` | `Guard` |
| `soft` | `SoftGuard` |
| `invariant` | `Invariant` (port) |
| `change` (+ tool proposals) | `TransitionContributor` |
| `afterProse` | `PostNarrativeContributor` |
| `committed` | `AfterCommitHook` + schedule drain `SystemTurnScheduler` |
| `rejected` | `OnTurnRejected` |
| `load` | `SessionHydrator` |
| `narrativeSystem` / `narrativeUser` | `NarrativePromptContributor` |
| `narrativeBrief` / `narrativeHistory` | `NarrativeContextProvider` |
| `narrativeStyle` | `NarrativeStyleProvider` |
| `hostStatus` | `StatusPanelProvider` |
| `hostHelp` | `HelpProvider` |
| `hostReadModels` | `registerReadModel` |
| `aiTasks` / `aiTools` | `registerAgentTaskType` / `registerAgentTool` + handlers + contributor |

Protocols that must survive a rewrite (already in contracts):

- `ModuleOpProposal` (tool → propose stage)
- `ModuleSystemSchedule` extras keys (AfterCommit → scheduler drain)
- `MODULE_IR_VERSION` dual-load policy if IR shape changes

## 5. Implementation sketch (for a future task)

Suggested phases when you pick this up:

### Phase A — Spec lock

1. Normative “MomentRegistry” interface in contracts or core-internal.
2. Freeze moment list v1 (= current `CompiledMomentsIr` + catalogs).
3. Document merge policies per moment (today’s port merge rules, renamed).

### Phase B — Dual runtime

1. Core can run a turn via **ports index** *or* **moment registry**.
2. `bindCompiledModule` either fills moments directly or keeps ports shim.
3. Compat fixtures (`bun run test:compat`) + first-party modules must pass both paths.

### Phase C — Pipeline cutover

1. TurnPipeline stages call MomentRegistry only.
2. Remove product use of `ModuleRegisterContext` add* surface.
3. Keep bare `register()` only if still needed for ancient fixtures — prefer migrating
   `fixture-hello` to sdk.

### Phase D — Delete dead weight

1. Delete or internalize unused port types from author-facing docs (already maintainer-only).
2. Shrink/remove `bindCompiledModule` port mapping; install becomes “register bindings”.
3. ADR 0005 → status **Implemented**; update 03/06/12 architecture docs.

## 6. Triggers: when to actually do it

Start the rewrite when **one or more** hold:

- `bindCompiledModule` / port map becomes a frequent source of bugs or PRs.
- New core features repeatedly need “one more port” that is just another moment alias.
- Core maintainer onboarding cost is dominated by 12-extension-surface vs IR moments.
- A pipeline redesign (stages/transaction boundaries) already forces large core churn —
  piggy-back moments-native then.

**Do not** start only for aesthetics if ports are stable and compat is green.

## 7. Consequences

### Positive (when done)

- Single vocabulary: author = IR = core.
- Thinner sdk bind layer; less drift risk.
- Harder to accidentally re-expose ports as a second module API.
- Clearer core tests (“fire guard moment”, not “run Guard port list”).

### Costs / risks

- Large, careful core PR (or series); easy to break merge order/edge stages.
- Must not break atomicity, propose windows, or system-turn scheduling semantics.
- Temporary dual-path complexity during migration.
- Docs/architecture 12 may shrink or become historical.

### Compatibility guarantee

- External modules on `@rpengineext/module-sdk` **must not** need source rewrites.
- If IR must change: bump `MODULE_IR_VERSION`, support N and N-1 loaders for one cycle
  (same policy as ADR 0004).

## 8. Relationship to other ADRs

| ADR | Relation |
|-----|----------|
| 0001 CPA | Unchanged: pipeline + atomic commit remain; only *how modules are invoked* evolves. |
| 0004 Module SDK | Prerequisite: moments already exist in IR/bindings; this ADR moves core onto them. |
| 0002/0003 | Hosts/tools/scheduling semantics preserved; may simplify internal wiring only. |

## 9. Checklist before marking Implemented

- [ ] MomentRegistry + pipeline call sites
- [ ] Dual-path or feature-flag migration with green `test:compat`
- [ ] First-party modules unchanged at source
- [ ] `fixture-hello` on sdk or explicit CoreTestModule type
- [ ] Architecture docs 03/06/12 updated; ports doc demoted to historical if removed
- [ ] No public export of `ModuleRegisterContext` as author API (already true; keep true)
- [ ] This ADR status → Implemented + date

## 10. References

- Runtime today: `packages/module-sdk/src/compile/bind-compiled-module.ts`
- IR: `packages/contracts/src/modules/compiled-ir.ts`
- Protocols: `packages/contracts/src/modules/module-proposals.ts`
- Author guide: `docs/modules/README.md` · SDK reference: `docs/modules/sdk-reference.md`
- Ports (maintainer / current bus): `docs/architecture/12-extension-surface.md`
