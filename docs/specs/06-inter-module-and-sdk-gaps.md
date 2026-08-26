# Spec 06 — Inter-Module Contracts & SDK Composition APIs (Production)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Priority** | P2 |
| **Depends on** | Specs 01, 02, 04 |
| **Blocks** | safe multi-module production; Spec 07 |
| **Owner area** | module-sdk ctx, registry readModels, CI boundaries, docs |
| **Release mode** | production — baseline + **`ctx.readModel` required**; `turn.plan` post-1.0 |

## 1. Goal

Модули в production стыкуются **без** import internals:

- strict `provides`/`requires`;
- package boundary CI;
- documented public contracts;
- first-class **`ctx.readModel`** for stable cross-module queries;
- **push-уведомления** между модулями через `events` (emit/subscribe, post-outcome, observe-only);
- **lifecycle** hooks (`init` / `shutdown`) для модулей с внешними ресурсами.

## 2. Current state

- capability graph, `access.read`, `host.readModels` exist.
- Cross-module reads often manual slice parse → brittle at scale.
- Risk: `module-a` depends on `module-b` package internals.
- No author push channel: internal `EventBus` (core) is observe-only and non-author (spec 01 §4.4).

## 3. Scope

### In scope for Platform 1.0 (all required)
- Strict capability satisfaction on **default production host**
- CI: forbid `module-*` → `module-*` runtime dependencies
- `docs/modules/conventions.md` inter-module rules + priority bands
- Public contract on all first-party READMEs
- **D. `ctx.readModel(name, args?)`** on `ModuleCtx` — shipped, documented, tested
- Discoverability: readModels listed in module public contract (README); optional manifest metadata if cheap
- **E. `events` capability** (emit + subscribe) — push-уведомления, §7
- **F. Module lifecycle** (`init` / `shutdown`) — §8

### Explicit post-1.0 (deferred by design — NOT a cut of baseline)
- **A. `turn.plan` + extras helpers** — only if later product modules need plan bus beyond extras
- B. `rules.costs`
- C. structured action kinds beyond free_text
- Author interceptors / raw ports
- Dynamic event subscriptions / event filters (replaces static `events.subscribe` at runtime)
- Versioned capability tokens (`capability:npc@v2`)
- ADR 0005

### Out of scope forever-as-truth
- Internal core `EventBus` as author channel or world mutation path (sanctioned author channel = `events` capability, §7)
- Foreign slice writes

## 4. Inter-module rules (normative)

### 4.1 Allowed
1. Own-slice ops/commands only.  
2. Foreign read via `access.read` and/or **`readModel`**.  
3. `provides` / `requires` tokens.  
4. Namespaced turn extras (ephemeral, not SoT).  
5. System turns + AI tools for follow-up writes to **own** slice.
6. Cross-module **push-уведомления**: `events` emit/subscribe (post-outcome, observe-only — §7).
7. Lifecycle hooks: `init` / `shutdown` для ресурсов модуля (§8).  

### 4.2 Forbidden
1. Runtime dependency on another `module-*` package.  
2. Writing foreign slice.  
3. Order races without priority rules.  
4. Using core `EventBus` as author channel or for world mutation (sanctioned: `events` capability, §7).
5. Direct LLM SDK.
6. World mutation from event dispatch (`ctx.op` в handler — fail-loud, §7.3).  

### 4.3 Public contract
Every first-party and scaffold module README lists: provides, requires, slice, meta, config, readModels, **events (emitted + subscribed)**, tasks/tools/system reasons.

## 5. Baseline implementation (required)

### 5.1 Strict capability graph
- Default host/`createEngine` production path: `failOnMissingCapability = true`.  
- Failure code `MODULE_REQUIRES_MISSING` (spec 03).  
- Covered by stress S04.
- **Duplicate `provides` token is allowed** — the graph treats a token as satisfied when at least one loaded module provides it (existence check); no ambiguity; ordering of providers by registration order (spec 04 §4.1.1).
- **Capability tokens are unversioned in 1.0** (`capability:npc`, not `capability:npc@v2`). Breaking semantic change of a provided capability = **MAJOR** of the providing module + public contract update (compatibility.md). Versioned tokens — explicit post-1.0 candidate (§3).

### 5.2 Boundary CI
- Script `bun run test:module-boundaries`  
- Fails if any `packages/modules/*/package.json` has runtime dep on `@rpengineext/module-*`  
- Allowed runtime: `module-sdk`, `zod`; `contracts` only if justified (prefer types via sdk)  
- `core` devDependency only  

### 5.3 Docs
- `docs/modules/conventions.md` — rules §4 + priority bands (spec 04)  
- First-party README public contracts  

## 6. Required additive: `ctx.readModel` (Item D)

### 6.1 Why production-required
Dozens of modules will otherwise re-parse foreign slices and couple to storage shape. readModels are already registered — authors need a **stable call path**.

### 6.2 API (normative — locked for 1.0)

```ts
// ModuleCtx
readModel(name: string, args?: JsonObject): JsonObject
```

**Behavior (single contract — no dual path):**

| Case | Behavior |
|------|----------|
| found | returns JSON object from registered readModel |
| unknown name | **fail loud** in **all** moments (including narrative): turns into turn/boot failure with code `MODULE_READ_MODEL_UNKNOWN`. **No** `undefined`, **no** optional Result dual API on `ModuleCtx` for 1.0 |
| readModel throws | wrapped failure; `details` include caller `moduleId` and `name` when known |
| write | **impossible** via this API |

Rationale: one author pattern; silent misses caused brittle cross-module bugs at scale.

Permissions: readModel does not grant slice write; respect any future read ACLs if introduced.

### 6.3 Implementation touchpoints
- `packages/module-sdk/src/types/context.ts`
- `packages/module-sdk/src/compile/create-ctx.ts`
- wiring to contribution index / host readModel registry
- sdk-reference + CHANGELOG 1.0 (part of surface)
- tests:
  - module B calls `working_memory.window` (or fixture readModel) successfully
  - unknown name → stable code
  - access does not allow write

### 6.4 DoD (D) — required for tag
- [ ] API on ModuleCtx
- [ ] Documented in sdk-reference moments/ctx table (`readModel` column)
- [ ] Cross-module success test
- [ ] Unknown name → `MODULE_READ_MODEL_UNKNOWN` in **change** and **narrative** moments (both)
- [ ] No silent `undefined` path in public types
- [ ] Compat fixture updated if needed
- [ ] errors.md includes `MODULE_READ_MODEL_UNKNOWN` + fix hint

### 6.5 readModel providing norms (normative)

| Rule | Value |
|------|-------|
| Name pattern | readModel id: `<moduleId>` (с `-` → `_`) + `.` + local kebab name; регистрация — только из своего модуля |
| Args schema | optional `args` zod schema; при наличии валидируется на каждый вызов; fail → `MODULE_READ_MODEL_ARGS_INVALID` (caller moduleId, model name, zod path) |
| Return | plain `JsonObject` (уже тип); ничего кроме JSON |
| Break policy | изменение имени / shape / args readModel = **MAJOR** модуля + public contract update; имена стабильны в рамках MAJOR |
| Catalog | все readModels перечислены в public contract README (§4.3); вызывающая сторона читает каталог до вызова |
| Errors | вызов чужого readModel: обёрнутый failure с `details` (caller moduleId, name); провайдер не получает информацию о caller'е |

## 7. Events capability (Item E — required for 1.0)

### 7.1 Why production-required

Dozens/hundreds of modules need **push**, not polling:

- subscribers run **only when relevant** (не каждый turn) — перф с сотнями модулей;
- payload несёт контекст («что именно произошло»), а не парсинг чужого slice/diff;
- publisher не знает подписчиков: связи data-driven по именам, без import'ов и без module→module deps (boundary CI действует и на events).

### 7.2 API (normative — locked for 1.0)

```ts
// New capability kind "events": declare + subscribe (static, compile-time)
events?: {
  emit: EmitDecl[];                      // события, которые модуль может публиковать
  subscribe: SubscribeDecl[];            // статические подписки
};

interface EmitDecl {
  name: string;                          // local kebab-case; canonical = <moduleId>.<name>
  schema?: z.ZodType<JsonObject>;        // payload validation (как ops payload)
  description?: string;
}

interface SubscribeDecl {
  name: string;                          // canonical event name (dot-полное)
  priority?: number;                     // default 100; меньше = раньше
  handler(ctx: ModuleCtx, event: { payload: JsonObject }): void | Promise<void>;
}

// ModuleCtx
emit(name: string, payload?: JsonObject): void;
```

Object sugar / `capabilities[]` нормализуются в один список (как capability kinds, spec 01 §4.1).

### 7.3 Semantics (locked — как readModel в §6.2)

| Aspect | Rule |
|--------|------|
| Canonical name | `<moduleId>` (с `-` → `_`, как slice names) + `.` + local kebab name; pattern валидируется при define (invalid → `MODULE_DEFINE_INVALID`) |
| Uniqueness | один publisher на имя: duplicate → **boot fail** `MODULE_EVENT_DUPLICATE` (оба moduleId в details) |
| Subscription binding (boot) | publisher загружен, имени нет → **boot fail** `MODULE_EVENT_UNKNOWN` (typo); publisher не загружен и `requires` на его capability нет → **boot warning** + подписка инертна (composition variance, documented); publisher не загружен и `requires` есть → fail через `MODULE_REQUIRES_MISSING` (spec 04 strict default) |
| Payload | валидируется по `schema` publisher'а при emit; fail → `MODULE_EVENT_PAYLOAD_INVALID` (moduleId, event, zod path) |
| Dispatch timing | только в `turn.committed` и `turn.rejected` (player **и** system turns); emit в других моментах → fail-loud `MODULE_EVENT_EMIT_FORBIDDEN` (mid-turn → turn rejected; `event.dispatch` — отдельный разрешённый контекст) |
| Ordering | FIFO-очередь по моменту emit; внутри события: subscribers по (priority asc → registration order asc, spec 04 §4.1.1) — полностью детерминировано |
| Handler permissions | observe-only: readModel / access.read / свой slice — ok; `ctx.op` / `proposeOp` → fail-loud `MODULE_MOMENT_OP_FORBIDDEN`; `deny()` → fail-loud `MODULE_EVENT_DENY_FORBIDDEN`; `scheduleSystem` — ok; `passage` — no; `emit` — ok (каскад, capped) |
| Cascade / burst caps | handler может emit; caps: `MODULE_EVENT_MAX_CASCADE_DEPTH = 8`, `MODULE_EVENT_MAX_BURST_PER_TURN = 256` (константы в contracts, не магические числа); breach → `MODULE_EVENT_CASCADE_LIMIT` / `MODULE_EVENT_BURST_LIMIT`, дальнейший диспатч прерывается, warning; мир не затронут |
| Handler error | throw в dispatch (post-outcome) → **turn остаётся committed**; warning `MODULE_EVENT_HANDLER_ERROR` в warnings + structured log (никогда не silent; паттерн ядра «AFTER stage error ignored after commit») |
| Persistence | события эфемерны (turn-scoped), в save не пишутся; подписки статичны — персистить нечего; pending system turns из handler'а (scheduleSystem) персистятся штатно (S19) |
| Dynamic subscription | **нет в 1.0** — static only (boot-валидация, детерминизм); dynamic subscribe = post-1.0 additive (§3) |
| Non-goal | события — не канал мутации мира; core `EventBus` — не author channel (§4.2) |

### 7.4 Touchpoints (indicative)

- sdk: `types/capabilities.ts` (events kind), `normalize.ts` / `build-ir.ts`, `create-ctx.ts` (emit + moment guard), `bind-compiled-module.ts`
- core: registry event graph (duplicate/unknown binding), turn-pipeline dispatch hook (после committed handlers / в rejected path), limits, warnings; contracts: codes + caps constants
- targeting (ADR 0005 alignment): events dispatch и lifecycle hooks реализуются как **first-class моменты** пайплайна (форма целевого MomentRegistry), а не как отдельный port-слой — post-1.0 ADR 0005 тогда завершает миграцию старых портов и не переделывает эти поверхности

### 7.5 DoD (E) — required for tag

- [ ] `events` capability kind + `ctx.emit` normative (spec 01 §4.1–§4.2)
- [ ] Boot: duplicate (E16), unknown (E17), optional warn path — tests
- [ ] Dispatch: committed/rejected only (E19); handlers observe-only (E15 / E20); ordering locked — tests
- [ ] Caps: cascade / burst (E22 / E23) — tests
- [ ] Handler error post-commit → committed turn + warning (E21) — test
- [ ] Harness: events log + `expectEvent` (spec 02)
- [ ] sdk-reference + errors.md + conventions.md coverage; public contracts list events
- [ ] Same boundary CI: события не создают module→module deps

## 8. Module lifecycle (Item F — required for 1.0)

### 8.1 Why

Модули «разного вида» держат внешние ресурсы (соединения, worker'ы, таймеры). Без санкционированных `init`/`shutdown` они вешают ресурсы в замыканиях создателей без управления временем жизни и обработки ошибок старта.

### 8.2 API (normative)

```ts
defineModule({
  // ...
  init?(ctx: ModuleCtx): void | Promise<void>,   // once, после boot-валидации, до первого turn
  shutdown?(): void | Promise<void>,             // при остановке engine (cleanup only)
});
```

### 8.3 Semantics (locked)

| Aspect | Rule |
|--------|------|
| `init` timing | после полной boot-валидации (registry, requires, events graph), до первого seed/turn; runs once (hot-reload вне scope, spec 04) |
| `init` ctx | **без world-доступа**: config + log surface; op / emit / deny / readModel / access → fail-loud `MODULE_MOMENT_OP_FORBIDDEN` (write-forbidden context; message указывает `init`) |
| `init` ordering | priority asc (как все ordered surfaces), sequential — детерминизм |
| `init` failure | **boot fail** `MODULE_INIT_FAILED` (moduleId, hint, без секретов); engine не стартует; shutdown для не-инициализированных модулей не вызывается |
| `shutdown` timing | при engine `stop()` / dispose; **reverse priority** (последний init — первый shutdown) |
| `shutdown` ctx | нет ctx; cleanup only; errors → warning `MODULE_SHUTDOWN_ERROR` (structured log), stop не валится |
| Persistence | init/shutdown не пишут в save; при init-фейле мир/сейв не создаются |

### 8.4 DoD (F) — required for tag

- [ ] Optional hooks; нормы в spec 01 §4.5 — тесты S21
- [ ] `init` failure → boot fail `MODULE_INIT_FAILED` — тест
- [ ] `shutdown` error → warning `MODULE_SHUTDOWN_ERROR` — тест
- [ ] Ordering: init priority asc, shutdown reverse — тест
- [ ] `init` world-access fail-loud — тест
- [ ] Harness `stop()` вызывает shutdown — тест

## 9. Deferred Item A — `turn.plan` (post-1.0)

Not required for Platform 1.0 tag.

Rationale: current extras + change/narrative ordering + readModel cover first wave modules; plan moment is a larger IR/pipeline additive.

When revisited: optional moment, namespaced extras helpers, compat fixture, minor sdk bump — see historical sketch in git history if needed.

**Events (Item E) do NOT replace `turn.plan`:** events notify **post-outcome**; plan is a **pre-outcome** decision moment — different concern.

**Release notes must list A as deferred.**

## 10. Implementation checklist

### Baseline
- [ ] Strict requires default ON (host + tests)
- [ ] `test:module-boundaries`
- [ ] conventions.md
- [ ] first-party public contracts
- [ ] recipes mention access.read + provides/requires + readModel + events + lifecycle

### readModel
- [ ] implement + wire
- [ ] tests + docs + error code
- [ ] first-party: at least one readModel remains queryable (working-memory)
- [ ] args schema validation (E26)
- [ ] providing norms §6.5 written

### events (Item E)
- [ ] `events` capability: emit + subscribe, compile/bind
- [ ] boot validation: duplicate (E16), unknown (E17), optional warn path
- [ ] dispatch: committed/rejected only (E19); handlers observe-only (E15 / E20); caps (E22 / E23)
- [ ] handler error → warning (E21)
- [ ] harness events log + expectEvent

### lifecycle (Item F)
- [ ] init/shutdown hooks; init failure → boot fail (E24); shutdown error → warn (E25)
- [ ] ordering: init priority asc, shutdown reverse

### Release hygiene
- [ ] note Item A deferred in release notes (spec 07)

## 11. DoD (production — all required)

- [ ] Strict capability satisfaction on default host
- [ ] `test:module-boundaries` green in CI / platform gate
- [ ] conventions.md published and linked
- [ ] All first-party modules have public contract sections
- [ ] No first-party runtime module→module deps
- [ ] `ctx.readModel` shipped per §6.4 (+ args validation E26)
- [ ] readModel providing norms published (§6.5) and linked
- [ ] `events` shipped per §7.5 (emit/subscribe, bounds, fail-loud paths)
- [ ] lifecycle shipped per §8.4 (init/shutdown, failure codes)
- [ ] duplicate `provides` + unversioned tokens policy documented (§5.1)
- [ ] registration-order tie-break documented (spec 04)
- [ ] Item A explicitly deferred in release notes (not silently dropped without mention)
- [ ] Stress S15–S22 + A09 green; harness events + expectEvent green
- [ ] Stress/compat still green

## 12. Verification

```bash
bun run test:module-boundaries
bun run test:compat
bun run test:modules-stress
bun run test:module-sdk
bun run test:host-bootstrap
bun run test:working-memory
bun run typecheck
```

| Check | Pass |
|-------|------|
| missing requires | boot fail |
| module depends on module-* | CI fail |
| readModel cross-module | green |
| unknown readModel | stable code |
| subscribe typo (publisher loaded) | boot fail `MODULE_EVENT_UNKNOWN` |
| emit in narrative | turn rejected with `MODULE_EVENT_EMIT_FORBIDDEN` |
| handler `ctx.op` in dispatch | fail-loud `MODULE_MOMENT_OP_FORBIDDEN`, world unchanged |
| `init` throws | boot fail `MODULE_INIT_FAILED` |

## 13. Risks

| Risk | Mitigation |
|------|------------|
| Ports creep | refuse author ports; only readModel |
| readModel as god-API | namespaced model ids; own-module registration only |
| Silent undefined | **banned** — fail loud on unknown in all moments (locked §6.2) |
| Dual Result vs throw API | single throw/fail-loud ctx API only for 1.0 |
| Event storms / cross-talk | static subscriptions; single-publisher uniqueness; cascade/burst caps (§7.3) |
| Events as god-channel | namespaced names; own declare only; handlers observe-only |
| Ordering drift | priority + registration order locked; S15 in stress |
| Dynamic subscription absent | explicit post-1.0 additive (§3), not silent gap |
| Re-initialization hazards | no hot-reload in 1.0; init runs once (spec 04 out-of-scope) |

## 14. Exit

Spec **done** when §9 complete and §10 green.  
Item A remaining deferred is **success**, not incomplete baseline.
