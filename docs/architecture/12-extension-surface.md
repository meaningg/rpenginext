# Extension Surface (v1 — wide freeze)

> **Статус:** normative **for core maintainers / sdk binder**  
> **Не author API.** Авторы модулей используют `@rpengineext/module-sdk` ([ADR 0004](../adr/0004-module-sdk-cbmd.md), [../modules/README.md](../modules/README.md)).  
> **Цель этого документа:** runtime ports, в которые sdk компилирует capabilities.  
> Core меняется только если не хватает *механизма*, а не *контента*.

## 1. Почему «просто длинный список хуков» недостаточен

Если добавлять по одному named hook «под модуль», core всё равно придётся трогать.

Поэтому v1 = **три слоя расширений**:

| Слой | Что даёт | Когда core не нужен |
|------|----------|---------------------|
| **A. Catalog registrations** | новые команды, slice, agent tasks, tools, validators | почти всегда для данных/механик |
| **B. Stage interceptors** | before/after/onError на *каждой* стадии pipeline | поперечная логика, аудит, метрики, доп. checks |
| **C. Typed contribution ports** | структурированный сбор вкладов с merge-политикой | gameplay-смысл на конкретных фазах |

Модуль = комбинация A+B+C.  
Новый product-module (npc/plot/…) **не** должен требовать D-слоя «ещё одна стадия в core».

---

## 2. Слой A — Catalog registrations (главный анти-core-churn)

Регистрируются в `module.register(ctx)`. Это **не** хуки pipeline, а пополнение каталогов runtime.

| Registration API | Назначение | Пример |
|------------------|------------|--------|
| `registerSlice(def)` | namespaced state schema + migrations | `npc`, `inventory` |
| `registerCommand(def)` | type + payload schema + pure apply + optional validate | `npc.setRelation` |
| `registerInvariant(def)` | global/slice invariant after dry-apply | qty ≥ 0 |
| `registerConflictKey(def)` | как детектить write conflicts | path `npc.actors.*` |
| `registerAgentTaskType(def)` | task type + in/out schema + default constraints | `npc.intent` |
| `registerAgentTool(def)` | tool for orchestrator allowlist | `canon.search` |
| `registerActionType(def)` | known normalized action kinds + schema | `speak`, `move`, `use_item` |
| `registerIntentType(def)` | intent vocabulary | `social.speak_to` |
| `registerPublicProjector(def)` | redacted view for player status panel | HP, known NPCs |
| `registerMemoryKind(def)` | kinds of memory items | `scene_summary` |
| `registerCapability(id)` | provides for graph | `capability:npc` |
| `registerReadModel(def)` | named selector `getX(state, args)` | `npc.byId` |
| `registerTemplate(def)` | named text/fallback fragments for host (not LLM truth) | error copy keys |
| `registerConfigSchema(def)` | module-specific config section validation | `modules.npc.*` |
| `registerMigration(def)` | slice schemaVersion migrate | v1→v2 |

### Правило

Если модулю нужны **новые данные или операции над миром** — это registration команд/slice, а не новый pipeline stage.

Core знает только *как* apply/validate/commit commands, не *смысл* `npc.*`.

---

## 3. Слой B — Generic stage interceptors

Для **каждой** стадии pipeline (и session lifecycle) модуль может повесить:

```text
StageInterceptor {
  stage: StageId | "session.start" | "session.stop" | "turn.begin" | "turn.end"
  when: "before" | "after" | "onError"
  priority: number          // manifest/module priority as default
  permission?: string
  handle(ctx): Result<void | InterceptorEffect>
}
```

`StageId` v1:

```text
begin | normalize | intent | guard | plan | propose |
validate_commands | narrate | present | commit | after | end
```

### InterceptorEffect (ограниченный)

| Effect | Allowed | Notes |
|--------|---------|-------|
| `reject(failure)` | before/after until pre-commit | full turn rollback path |
| `warn(message)` | always | non-fatal |
| `patchExtras(ns, data)` | before/after | namespaced only |
| `enqueueAgentTask(task)` | before plan/propose/narrate only | budget applies |
| `enqueueCommands(cmds)` | before validate / during propose window | still draft |
| *(none)* mutate authoritative state | never | |

### Зачем это снимает давление с core

Почти любая «мне нужно вклиниться чуть раньше/позже X» закрывается `before/after:stage` **без** нового named port.

Named ports (слой C) остаются для мест, где нужен **typed merge многих вкладов**.

---

## 4. Слой C — Typed contribution ports (расширенный freeze)

Это места с явной семантикой и политикой слияния.  
Набор **широкий**, но **закрытый** в v1: лучше сразу много розеток, чем потом пилить core.

### 4.1 Input & understanding

| Port | Stage | Input → Output | Merge policy |
|------|-------|----------------|--------------|
| `InputNormalizer` | normalize | raw → partial normalized fields | pipeline chain (ordered), last defined field wins only within declared keys; conflicts → reject |
| `ActionClassifier` | normalize | raw/normalized → actionType candidates + confidence | collect; core picks highest confidence legal type or reject/ask |
| `EntityResolver` | normalize/intent | text refs → entity ids (npc/item/loc) | collect candidates; ambiguity → structured reject `AMBIGUOUS_TARGET` |
| `IntentContributor` | intent | action → intent patches | deep-merge namespaced patches; hard conflicts reject |
| `IntentScorer` | intent | intent candidates → scores | max/weighted by priority |
| `DisambiguationProvider` | intent | ambiguity → player-facing options | collect (used if host supports; else reject) |

### 4.2 Rules & legality

| Port | Stage | Role | Merge |
|------|-------|------|-------|
| `Guard` | guard | hard reject / allow | any hard reject fails turn |
| `SoftGuard` | guard | warnings, mild costs flags in extras | collect warnings |
| `ResourceCostEvaluator` | guard/propose | declare costs (time/items/stamina) | sum/merge by cost key |
| `PrerequisiteChecker` | guard | missing requirements list | collect; any missing → reject |
| `PolicyRule` | guard/validate | declarative allow/deny rules on intent+draft | deny overrides allow |

### 4.3 Planning & AI

| Port | Stage | Role | Merge |
|------|-------|------|-------|
| `Planner` | plan | plan artifacts + suggested agent tasks | collect artifacts by ns; concat tasks |
| `SalienceProvider` | plan | what entities matter this turn | union + cap by budget score |
| `AgentTaskContributor` | plan/narrate | extra tasks | concat; orchestrator schedules |
| `AgentTool` | on demand | tools | catalog + allowlist per task |
| `BriefPolicy` | narrate | what secrets may/may not leak | merge deny-list union |
| `PromptFragmentProvider` | narrate/plan | legacy named prompt fragments (bridged into sections) | concat by slot ordered |
| `NarrativePromptContributor` | narrate | compiled human-readable prompt sections (`system`/`user`) | concat; sort by priority+id per channel |
| `OutputRepairHintProvider` | agent repair | schema repair hints | concat |

### 4.4 World transition

| Port | Stage | Role | Merge |
|------|-------|------|-------|
| `TransitionContributor` | propose | `StateCommand[]` | concat; then validate/conflict |
| `CommandDecorator` | propose | wrap/enrich commands (ids, tags) | ordered map |
| `CommandValidator` | validate | extra per-command checks | all must pass |
| `Invariant` | validate | end-state checks | all must pass |
| `ConflictResolver` | validate | explicit merge for declared conflict keys | must be deterministic; else reject |
| `DraftSimulator` | validate | optional “preview facts” for brief | collect read-only projections |

### 4.5 Narrative & book presentation

| Port | Stage | Role | Merge |
|------|-------|------|-------|
| `NarrativeContextProvider` | narrate | brief slices | merge object by ns keys |
| `NarrativeStyleProvider` | narrate | tone/rating/voice constraints | merge; deny overrides |
| `NarrativeCritic` | narrate | post-LLM structured QA (continuity) | any hard fail → turn fail (rollback) |
| `PostNarrativeContributor` | present→commit (materialize) | emit StateCommands after passage prose is known | concat commands; progressive dry-apply |
| `PassageAssembler` | present | contribute sections to passage body model | ordered sections by slot/priority |
| `StatusPanelProvider` | present | sidebar/status lines for CLI/UI | concat by slot |
| `LocalizationContributor` | present | string tables for module UI bits | merge by locale key |

### 4.6 Turn/session lifecycle (typed)

| Port | When | Role | Truth mutation |
|------|------|------|----------------|
| `SessionBootstrap` | session start | initial commands for new game only (draft init transaction) | via init transaction |
| `SessionHydrator` | load | rehydrate module caches from state | memory only |
| `TurnSetup` | turn.begin | per-turn caches, salience seeds | extras only |
| `TurnTeardown` | turn.end | clear caches | memory only |
| `OnTurnRejected` | reject path | observe | no |
| `AfterCommitHook` | after success | observe/metrics/UI | **no** |
| `SystemTurnScheduler` | after success | request follow-up `system` turns | schedules only, doesn’t mutate |

### 4.7 Host-facing (CLI now, UI later)

| Port | Role |
|------|------|
| `HelpProvider` | `/help` topics from modules |
| `DebugDumper` | redacted debug slices (dev) |
| `CliCommandProvider` | extra CLI meta-commands (non-world), e.g. `/npcs` inventory peek if permitted |
| `SaveMetadataProvider` | extra fields in save list display |

---

## 5. Что модулю почти никогда не нужно от core

| Хочет автор модуля | Делает через |
|--------------------|--------------|
| Новый тип фактов в мире | `registerSlice` + `registerCommand` |
| Новые проверки | `Guard` / `Invariant` / `CommandValidator` / interceptor |
| Подмешать LLM | `registerAgentTaskType` + `AgentTaskContributor` / `Planner` |
| Инструмент поиска | `registerAgentTool` |
| Влиять на текст | `NarrativePromptContributor` + `NarrativeContextProvider` + `NarrativeStyleProvider` |
| Статус в CLI | `StatusPanelProvider` / `PublicProjector` |
| Пост-обработка memory | commands pre-commit **или** `SystemTurnScheduler` |
| Вклиниться «между» стадиями | `StageInterceptor before/after` |

---

## 6. Merge, order, privileges

1. Default order: `(module.priority asc, module.id asc, registration order)`.  
2. Namespaced extras/brief keys: `moduleId.path` — чужие ns писать нельзя.  
3. Deny/reject всегда сильнее allow.  
4. Conflict without registered deterministic resolver → turn reject.  
5. Interceptors cannot skip stages or reorder pipeline.  
6. `after/commit` observe hooks cannot enqueue world commands.

---

## 7. Manifest declaration

Модуль **обязан** перечислить используемые ports/registrations (для аудита и least-privilege UX):

```json
{
  "registers": ["slice:npc", "command:npc.*", "agent-task:npc.intent", "read-model:npc.byId"],
  "contributes": [
    "Guard",
    "Planner",
    "TransitionContributor",
    "NarrativeContextProvider",
    "StatusPanelProvider"
  ],
  "interceptors": [
    { "stage": "plan", "when": "before" }
  ]
}
```

Strict mode: implementation without manifest entry → boot fail.

---

## 8. Когда всё-таки нужен ADR и изменение core

Только если требуется одно из:

1. **Новая стадия** pipeline с другой транзакционной семантикой.  
2. **Новый merge primitive**, которого нет (не хватает collect/chain/deny-overrides).  
3. Изменение **atomic boundary** / commit protocol.  
4. Новый **security boundary** (permissions model).  
5. Смена host contract (не module gameplay).

Не повод для core change:

- новый gameplay domain;
- новый LLM task type;
- новые поля state;
- новые status lines;
- «хочу хук на 50ms раньше narrate» → interceptor.

---

## 9. Anti-patterns

- ❌ Просить core-stage `NpcCombat` вместо slice+commands+guards+contributors.  
- ❌ God-interceptor, который на `before:begin` делает всю игру.  
- ❌ Писать в чужой namespace brief/extras.  
- ❌ AfterCommit world mutation.  
- ❌ Динамически изобретать extension port id в runtime без contracts version bump.

---

## 10. Relationship to stability goal

```text
Content & rules  → modules (A+C)
Cross-cutting    → interceptors (B)
Mechanism        → core (rare, ADR)
```

Это и есть способ «сразу много точек», но без превращения core в бесформенный event soup:  
pipeline order и atomic commit остаются жёсткими; расширяется только *вкладочная поверхность*.
