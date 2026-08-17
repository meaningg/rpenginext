# Как писать модули для Core

> **Аудитория:** авторы модулей (first-party и third-party)  
> **Зависимости модуля:** только `@rpengineext/contracts` (+ опционально shared utilities)  
> **Нельзя:** импортировать internals `@rpengineext/core`, звать LLM SDK напрямую, мутировать world state в обход команд

Этот документ — **практический** гайд: от манифеста до тестов на **текущем** runtime.  
Нормативные детали surface: [12-extension-surface.md](../architecture/12-extension-surface.md).  
Система модулей: [03-module-system.md](../architecture/03-module-system.md).

---

## 1. Ментальная модель

```text
Игрок → Action → CORE TurnPipeline (стадии 0–11) → Passage / reject
                      ↑
                 ваши handlers
```

| Вы | Core |
|----|------|
| Регистрируете slice/commands/ports | Владеет state, atomic commit/rollback |
| Предлагаете `StateCommand[]` | Валидирует, dry-apply, commit |
| Кормите brief | Пишет prose через agents, собирает Passage |
| Observe после commit | Не даёт AFTER менять truth |

**Инвариант:** AI и модули *предлагают*. Core *проверяет и атомарно фиксирует*.

Ход **full-atomic**:

- до `COMMIT` всё в draft;
- любая фатальная ошибка → discard draft, мир как на входе хода;
- narrative fail = rollback (нет «мир уже другой, а текста нет»).

---

## 2. Минимальный скелет пакета

```text
modules/<id>/                  # или packages/modules/<id>/
  package.json                 # peer/dep: @rpengineext/contracts
  README.md
  src/
    index.ts                   # export createXxxModule(): Module
    manifest.ts                # ModuleManifest (или JSON)
    schema/
      slice.ts                 # zod schemas
      commands.ts
    handlers/
      guards.ts
      transitions.ts
      narrative.ts
    agents/                    # optional task types / tools
    __tests__/
      module.test.ts
```

### package.json (логический)

```json
{
  "name": "@you/rp-module-example",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": {
    "@rpengineext/contracts": "^0.1.0"
  }
}
```

Host подключает модуль так:

```ts
import { createEngine } from "@rpengineext/core";
import { createExampleModule } from "@you/rp-module-example";

const created = await createEngine({
  deps: { log, persistence, traceSink },
  modules: [createExampleModule()],
});
```

---

## 3. Контракт `Module`

```ts
import type { Module, ModuleRegisterContext } from "@rpengineext/contracts";

export function createExampleModule(): Module {
  return {
    manifest: { /* см. §4 */ },

    /** Только регистрация. Session state трогать нельзя. */
    register(ctx: ModuleRegisterContext) {
      // register* / add* — каждый вызов возвращает Result
      // при strictManifest ошибка валит boot, даже если Result не проверили
    },

    /** Опционально: прогреть кэши (без world commit). */
    async start(ctx) {},

    /** Опционально: закрыть ресурсы. */
    async stop(ctx) {},
  };
}
```

Lifecycle:

```text
boot → parse manifest → register(ctx) → capability graph
    → start() → (turns…) → stop()
```

---

## 4. Манифест (обязателен и должен совпадать с кодом)

```ts
import type { ModuleManifest } from "@rpengineext/contracts";

const manifest: ModuleManifest = {
  id: "example",                 // kebab-case / reverse-domain, unique
  version: "0.1.0",              // semver
  displayName: "Example Module",
  description: "Demo slice + guard + transitions",
  engines: {
    core: "^0.1.0",              // range против CORE_VERSION
    contracts: "^0.1.0",
  },
  priority: 100,                 // меньше = раньше (tie-break: id asc)
  provides: ["capability:example"],
  requires: ["capability:state-core"], // всегда есть у core
  permissions: [
    "state:read",
    "state:propose:example",     // без этого propose в slice example = PERMISSION_DENIED
  ],
  stateSlices: [{ name: "example", schemaVersion: 1 }],

  // Layer A — что регистрируете в каталогах
  registers: [
    "slice:example",
    "command:example.setValue",
    "migration:example",
  ],

  // Layer C — typed ports, которые реально add*
  contributes: [
    "Guard",
    "TransitionContributor",
    "NarrativeContextProvider",
  ],

  // Layer B — каждый addInterceptor должен быть здесь
  interceptors: [
    { stage: "propose", when: "after" },
  ],
};
```

### strictManifest (default: **true**)

| Вызов | Нужно в манифесте |
|-------|-------------------|
| `addGuard` / `addPlanner` / … | `contributes: ["Guard"]` / `"Planner"` / … |
| `addInterceptor({ stage, when })` | `interceptors: [{ stage, when }]` |
| `registerCommand` / `registerSlice` / … | `registers` с matching token (`command:…`, `slice:…`, или kind `command`) |

Несовпадение → **boot fail** (`REGISTRATION_INVALID`).

Legacy поле `extensionPoints` мержится в `contributes` (см. `effectiveContributes`).

---

## 5. Permissions (least privilege)

| Token | Зачем |
|-------|--------|
| `state:read` | читать `ctx.stateView` |
| `state:propose:<slice>` | предлагать команды в slice |
| `state:propose:*` | все slice (только privileged / review) |
| `agent:call:<taskType>` | `ctx.requestAgent` с этим type |
| `agent:call:*` | любой task (privileged) |
| `rng:use` | seeded RNG |
| `canon:read` / `canon:propose` | канон (если есть) |
| `memory:read` / `memory:write` | memory items |

**Runtime enforcement (core):**

- команда с `source.kind === "module"` и `source.id === yourModuleId` проверяется на `state:propose:<command.slice>`;
- `requestAgent` от module — на `agent:call:<task.type>`.

Всегда ставьте `source: { kind: "module", id: manifest.id }` на своих командах  
(если не указать, pipeline часто проставит module id у TransitionContributor).

---

## 6. Три слоя расширений

### 6.1 Layer A — Catalogs (`register*`)

Новые **данные и операции** без правок core.

| API | Назначение |
|-----|------------|
| `registerSlice` | namespaced state + zod + `initialValue` + `schemaVersion` |
| `registerCommand` | type + payloadSchema + pure `apply` (+ optional `validate`) |
| `registerInvariant` | check всего draft после dry-apply |
| `registerConflictKey` | ключ конфликтов записи |
| `registerMigration` | slice `fromVersion → toVersion` (на load) |
| `registerAgentTaskType` | новый LLM/mock task type + schemas |
| `registerAgentTool` | schema tool (+ `addAgentToolHandler`) |
| `registerActionType` / `registerIntentType` | vocabulary |
| `registerPublicProjector` | redacted view в `passage.visibleState` |
| `registerReadModel` | `get(state, args)` селектор |
| `registerTemplate` | named fallback strings для host |
| `registerConfigSchema` | schema секции конфига модуля |
| `registerMemoryKind` | виды memory items |
| `registerCapability` | extra capability id |

**Command apply — pure:** без I/O, без скрытого global state.

```ts
import { ok, err, failure, type CommandDefinition } from "@rpengineext/contracts";
import { z } from "zod";

const SetValue: CommandDefinition = {
  type: "example.setValue",
  slice: "example",
  payloadSchema: z.object({
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }).strict() as never,
  apply(state, command) {
    const key = String(command.payload.key);
    const value = command.payload.value as string | number | boolean;
    const prev = (state.slices.example ?? {}) as Record<string, unknown>;
    return ok({
      ...state,
      slices: {
        ...state.slices,
        example: { ...prev, [key]: value, schemaVersion: 1 },
      },
    });
  },
  validate(state, command) {
    // optional domain check against progressive draft
    return ok(undefined);
  },
};

ctx.registerCommand(SetValue);
```

### 6.2 Layer B — Interceptors

Вклиниться **до/после/onError** любой стадии без нового port.

```ts
ctx.addInterceptor({
  stage: "plan",          // begin|normalize|…|after|end | turn.begin|turn.end|session.*
  when: "before",
  handle(turnCtx, error) {
    turnCtx.trace.note({
      namespace: "example",
      title: "plan-before",
      body: "salience seed",
    });
    // effects: reject | warn | patchExtras | enqueueAgentTask | enqueueCommands
    return ok(undefined);
    // return ok({ type: "warn", message: "…" });
  },
});
```

**Нельзя:** мутировать authoritative state, переставлять стадии, писать в чужой namespace extras.

### 6.3 Layer C — Typed ports (`add*`)

Полный список: [12-extension-surface.md](../architecture/12-extension-surface.md).

| Стадия | Типичные ports |
|--------|----------------|
| NORMALIZE | `InputNormalizer`, `ActionClassifier`, `EntityResolver` |
| INTENT | `IntentContributor`, `IntentScorer`, `DisambiguationProvider` |
| GUARD | `Guard`, `SoftGuard`, `PrerequisiteChecker`, `ResourceCostEvaluator`, `PolicyRule` |
| PLAN | `Planner`, `SalienceProvider`, `AgentTaskContributor` |
| PROPOSE | `TransitionContributor`, `CommandDecorator` |
| VALIDATE | `CommandValidator`, `Invariant` (port), `ConflictResolver`, `DraftSimulator` |
| NARRATE | `NarrativeContextProvider`, `NarrativeStyleProvider`, `BriefPolicy`, `NarrativePromptContributor`, `PromptFragmentProvider` (legacy), `NarrativeCritic` |
| PRESENT | `PassageAssembler`, `StatusPanelProvider`, `LocalizationContributor` |
| AFTER | `AfterCommitHook`, `SystemTurnScheduler` (только schedule) |
| Session | `SessionBootstrap`, `SessionHydrator`, `TurnSetup`, `TurnTeardown`, `OnTurnRejected` |
| Host | `HelpProvider`, `DebugDumper`, `CliCommandProvider`, `SaveMetadataProvider` |

Все handlers возвращают `Result` / `Promise<Result>`:

```ts
import { ok, err, failure } from "@rpengineext/contracts";

ctx.addGuard({
  check({ action, intent }, turnCtx) {
    if (action.text === "forbidden") {
      return ok({
        allow: false,
        code: "GUARD_REJECTED",
        message: "player-safe message",
      });
    }
    return ok({ allow: true });
  },
});
```

---

## 7. TurnContext — что можно в ходе

```ts
turnCtx.turnId
turnCtx.sessionId
turnCtx.stateView          // readonly / frozen projection (draft или S0 по стадии)
turnCtx.permissions         // PermissionChecker модуля-скоупа (host/core)
turnCtx.propose(commands)   // только в propose window
turnCtx.requestAgent(task)  // normalize|plan|propose|narrate
turnCtx.log                 // structured logger
turnCtx.trace.note({ namespace, title, body, data? })
turnCtx.extras              // namespaced bag (не SoT)
turnCtx.rng?                // seeded, если session seed задан
```

**Запрещено:**

- `turnCtx.stateView.slices.x = …`
- прямые fetch/OpenAI из handler
- полагаться на AFTER для обязательной записи мира

Memory/summary в **том же** player turn → `StateCommand` в draft **до** COMMIT  
или `SystemTurnScheduler` → отдельный system turn после успеха.

---

## 8. State commands и атомарность

```ts
ctx.addTransitionContributor({
  contribute({ intent, planArtifacts }, turnCtx) {
    const commands = [
      {
        commandId: crypto.randomUUID(), // или свой id helper
        type: "example.setValue",
        slice: "example",
        payload: { key: "lastIntent", value: intent.intentType },
        reason: "record intent",
        source: { kind: "module" as const, id: "example" },
      },
    ];
    return ok({ commands });
  },
});
```

Порядок apply (core):

1. core meta / ваши команды в порядке propose + priority модулей;
2. schema + validate + progressive dry-apply;
3. invariants;
4. conflict keys → `ConflictResolver` или `COMMAND_CONFLICT`.

Core built-ins (можно propose при permission на `core`):

- `core.bumpTurn` (pipeline сам добавляет на player/system)
- `core.setFlag` / `core.clearFlag`
- `core.setClock`
- `core.setPassageCursor`

---

## 9. Agents и tools

### 9.1 Не звать LLM самим

Только через `turnCtx.requestAgent(task)` / suggested tasks из `Planner` / `AgentTaskContributor`.

```ts
ctx.registerAgentTaskType({
  type: "example.classify",
  inputSchema: /* zod JsonObject */,
  outputSchema: /* zod JsonObject */,
  defaultConstraints: { timeoutMs: 10_000, maxRepairAttempts: 1 },
});

ctx.addAgentTaskContributor({
  contribute({ stage, intent }, turnCtx) {
    if (stage !== "plan") return ok({ tasks: [] });
    return ok({
      tasks: [{
        taskId: crypto.randomUUID(),
        type: "example.classify",
        turnId: turnCtx.turnId,
        input: { intentType: intent?.intentType ?? "unknown" },
        constraints: {
          timeoutMs: 10_000,
          maxRepairAttempts: 1,
          optional: false, // fail turn if required task fails
        },
        requester: { kind: "module", id: "example" },
      }],
    });
  },
});
```

Permissions: `agent:call:example.classify`.

Standard core tasks (не ваша зона, но полезно знать):

- `narrative.write` — stage NARRATE (core);
- `action.interpret` — optional NORMALIZE (`agents.enableActionInterpret`).

Host в mock-режиме даёт `MockAgentScript`; в llm — `LlmPort`.

### 9.2 Tools

```ts
ctx.registerAgentTool({
  id: "example.search",
  description: "Search module index",
  argsSchema: z.object({ q: z.string() }).strict() as never,
  resultSchema: z.object({ hits: z.array(z.string()) }).strict() as never,
  permission: "state:read",
});

ctx.addAgentToolHandler({
  id: "example.search",
  description: "Search module index",
  invoke(args, turnCtx) {
    return ok({ hits: [] });
  },
});
```

Вызов: host/orchestrator `invokeTool` (allowlist + schema).  
В `contributes` укажите `"AgentTool"`.

---

## 10. Narrative и presentation

```ts
ctx.addNarrativeContextProvider({
  provide({ draft, intent }, turnCtx) {
    const slice = draft.slices.example ?? {};
    return ok({
      namespace: "example", // не чужой ns
      data: { slice, intentType: intent.intentType },
    });
  },
});

ctx.addNarrativeStyleProvider({
  provide() {
    return ok({ tone: "literary", rating: "PG-13" });
  },
});

ctx.addBriefPolicy({
  contribute() {
    return ok({ denyMention: ["secretFlag"], allowMention: [] });
  },
});

ctx.addStatusPanelProvider({
  provide({ draft }) {
    return ok({ lines: [{ slot: "example", text: "Example: ok" }] });
  },
});
```

`StatusPanelProvider` попадает в `passage.visibleState.statusPanel`.

---

## 11. Session bootstrap, load, system turns

```ts
// New game only — commands applied in init transaction (no narrative)
ctx.addSessionBootstrap({
  bootstrap({ isNewGame }) {
    if (!isNewGame) return ok({ commands: [] });
    return ok({
      commands: [/* seed slice commands */],
    });
  },
});

// After load — memory caches only
ctx.addSessionHydrator({
  hydrate({ state }, turnCtx) {
    // warm module-local cache from state
    return ok(undefined);
  },
});

// After successful player commit — schedule follow-up system turn
ctx.addSystemTurnScheduler({
  schedule() {
    return ok({
      requests: [{ reason: "example.cleanup", payload: { step: 1 } }],
    });
  },
});
```

System turns:

- kind `system`, atomicity как у player;
- **не** могут снова schedule’ить бесконечный drain в том же batch (core защищает);
- для тяжёлого post-process — отдельный system turn, не AFTER mutation.

AfterCommitHook = **observe only** (metrics/UI). Ошибки AFTER не откатывают commit.

---

## 12. Migrations slice

При `loadSession` core прогоняет `registerMigration` пока slice не дойдёт до `schemaVersion` из `registerSlice`.

```ts
ctx.registerSlice({
  name: "example",
  schemaVersion: 2,
  schema: v2Schema,
  initialValue: { schemaVersion: 2, items: {} },
});

ctx.registerMigration({
  slice: "example",
  fromVersion: 1,
  toVersion: 2,
  migrate(old) {
    return ok({
      schemaVersion: 2,
      items: (old as { items?: unknown }).items ?? {},
    });
  },
});
```

Держите `schemaVersion` **внутри** slice object.

---

## 13. Tracing для отладки

```ts
turnCtx.trace.note({
  namespace: "example",       // стабильный ns
  title: "Salience",
  body: "picked 3 entities",
  data: { ids: ["a", "b"] },
});
```

Попадает в turn `.md` → `## Module notes`.  
Secrets/API keys в note/data **нельзя**.

---

## 14. Полный минимальный пример

```ts
import {
  ok,
  type Module,
  type ModuleManifest,
  type StateCommand,
} from "@rpengineext/contracts";
import { z } from "zod";

export function createCounterModule(): Module {
  const id = "counter";

  const manifest: ModuleManifest = {
    id,
    version: "0.1.0",
    displayName: "Counter",
    description: "Increments a counter each turn",
    engines: { core: "^0.1.0", contracts: "^0.1.0" },
    priority: 200,
    provides: ["capability:counter"],
    requires: ["capability:state-core"],
    permissions: ["state:read", "state:propose:counter"],
    stateSlices: [{ name: "counter", schemaVersion: 1 }],
    registers: ["slice:counter", "command:counter.inc"],
    contributes: [
      "TransitionContributor",
      "NarrativeContextProvider",
      "StatusPanelProvider",
    ],
    interceptors: [],
  };

  const sliceSchema = z
    .object({
      schemaVersion: z.literal(1),
      value: z.number().int(),
    })
    .strict();

  return {
    manifest,
    register(ctx) {
      ctx.registerSlice({
        name: "counter",
        schemaVersion: 1,
        schema: sliceSchema as never,
        initialValue: { schemaVersion: 1, value: 0 },
      });

      ctx.registerCommand({
        type: "counter.inc",
        slice: "counter",
        payloadSchema: z.object({ by: z.number().int().default(1) }).strict() as never,
        apply(state, command) {
          const by = Number(command.payload.by ?? 1);
          const cur = (state.slices.counter ?? { value: 0 }) as { value: number };
          return ok({
            ...state,
            slices: {
              ...state.slices,
              counter: {
                schemaVersion: 1,
                value: (cur.value ?? 0) + by,
              },
            },
          });
        },
      });

      ctx.addTransitionContributor({
        contribute() {
          const commands: StateCommand[] = [
            {
              commandId: crypto.randomUUID(),
              type: "counter.inc",
              slice: "counter",
              payload: { by: 1 },
              reason: "tick",
              source: { kind: "module", id },
            },
          ];
          return ok({ commands });
        },
      });

      ctx.addNarrativeContextProvider({
        provide({ draft }) {
          return ok({
            namespace: "counter",
            data: { value: (draft.slices.counter as { value?: number } | undefined)?.value ?? 0 },
          });
        },
      });

      ctx.addStatusPanelProvider({
        provide({ draft }) {
          const value =
            (draft.slices.counter as { value?: number } | undefined)?.value ?? 0;
          return ok({ lines: [{ slot: "counter", text: `Count: ${value}` }] });
        },
      });
    },
  };
}
```

---

## 15. Тестирование

Используйте test harness core (не нужен CLI/UI):

```ts
import { describe, expect, test } from "bun:test";
import { createTestEngine } from "@rpengineext/core/testing";
import { createCounterModule } from "../src/index.ts";

describe("counter module", () => {
  test("success: increments on turn", async () => {
    const created = await createTestEngine({
      modules: [createCounterModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const session = await created.value.engine.startSession({ seed: "t" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "go",
    });
    expect(turn.status).toBe("committed");

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    expect((state?.slices.counter as { value: number }).value).toBe(1);
  });

  test("error: guard/permission path", async () => {
    // module without state:propose:counter → PERMISSION_DENIED
  });

  test("edge: empty action / boundary payload", async () => {
    // …
  });
});
```

Минимум по project rules: **success / error / edge** на основной handler set.

Mock LLM:

```ts
import { MockAgentScript } from "@rpengineext/core";

const script = new MockAgentScript()
  .fixed("narrative.write", { prose: "…" })
  .fixed("example.classify", { label: "ok" });

await createTestEngine({ modules: […], mockAgentScript: script });
```

---

## 16. Do / Don’t

| Do | Don’t |
|----|-------|
| Зависеть от `contracts` | Импортировать `core/src/...` internals |
| Declared `contributes` / `registers` / `interceptors` | Тихий add* в strict mode |
| Least-privilege permissions | `state:propose:*` «на всякий» |
| Pure command `apply` | I/O внутри apply |
| Namespaced extras/brief (`example.*`) | Писать в чужой namespace |
| `Result` + player-safe messages | `throw "string"` через границу |
| `trace.note` для дебага | Класть API keys в trace |
| System turn / pre-commit commands для memory | Мутировать мир в AfterCommit |
| Тесты без сети | Live LLM в unit CI |

---

## 17. Когда всё-таки нужен ADR / core change

Только если не хватает **механизма**:

1. Новая стадия pipeline с другой транзакционной семантикой  
2. Новый merge primitive  
3. Смена atomic boundary  
4. Новая security boundary  
5. Смена host contract Engine/Session  

Не повод для core:

- новый domain (npc/plot/inventory)  
- новый agent task type  
- новые поля state  
- «хочу хук на 50ms раньше narrate» → interceptor  

---

## 18. Чеклист перед PR модуля

- [ ] `manifest.id` / version / engines  
- [ ] `permissions` минимальны и достаточны  
- [ ] `registers` + `contributes` + `interceptors` = фактические вызовы  
- [ ] Slice + commands + migrations задокументированы  
- [ ] Agent tasks/tools (если есть) + permissions  
- [ ] README: что чувствует игрок, state, commands, config  
- [ ] ≥3 теста (success / reject / edge), без сети  
- [ ] Нет core import / vendor LLM SDK  
- [ ] Boot с `strictManifest: true` зелёный  
- [ ] Hello-turn с вашим модулем: commit + reject path  

---

## 19. Карта документов

| Документ | Зачем |
|----------|--------|
| **Этот файл** | Практика: как писать модуль под текущий core |
| [README.md](./README.md) | Короткий index + checklist |
| [_template.md](./_template.md) | Заготовка манифеста/пакета |
| [03-module-system.md](../architecture/03-module-system.md) | Норматив lifecycle/permissions |
| [12-extension-surface.md](../architecture/12-extension-surface.md) | Полный freeze ports A/B/C |
| [04-state-and-commands.md](../architecture/04-state-and-commands.md) | Команды и atomicity |
| [06-turn-pipeline.md](../architecture/06-turn-pipeline.md) | Стадии хода |
| [05-agents.md](../architecture/05-agents.md) | LLM tasks |
| [09-testing.md](../architecture/09-testing.md) | Стратегия тестов |
| `@rpengineext/core/testing` | `createTestEngine`, fixture hello |

---

## 20. Быстрый «рецепт» выбора API

| Хочу… | Делаю |
|-------|--------|
| Хранить факты модуля | `registerSlice` + `registerCommand` |
| Запретить действие | `Guard` / `PolicyRule` / `PrerequisiteChecker` |
| Предупредить, но не стоп | `SoftGuard` → warnings |
| Спросить LLM | `registerAgentTaskType` + `AgentTaskContributor` / `Planner` |
| Дать tool | `registerAgentTool` + `addAgentToolHandler` |
| Влиять на текст | `NarrativePromptContributor` + `NarrativeContextProvider` + style providers |
| Строка статуса в CLI | `StatusPanelProvider` / `PublicProjector` |
| Вклиниться между стадиями | `addInterceptor` |
| Сиды новой игры | `SessionBootstrap` |
| Пост-обработка после хода | commands pre-commit **или** `SystemTurnScheduler` |
| Help в CLI | `HelpProvider` |
| Миграция сейва | `registerMigration` |
