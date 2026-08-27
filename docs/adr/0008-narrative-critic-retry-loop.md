# ADR 0008: NarrativeCritic — resurrection with a rewrite loop (reject + retry, not turn-kill)

> **Status:** Accepted
> **Date:** 2026-08-26
> **Implemented:** 2026-08-27 (см. §9 — чеклист выполнен)
> **Depends on:** [ADR 0001](./0001-contracted-pipeline.md) (narrative.write as required standard task),
> [ADR 0007](./0007-narrative-prompt-profiles.md) (repair templates reused for semantic rounds),
> [01-principles](../architecture/01-principles.md) §6 + [specs/07 §11](../specs/07-release-and-versioning.md) (core change requires ADR),
> [12-extension-surface](../architecture/12-extension-surface.md) §4.5 (NarrativeCritic port — semantics change)
> **Changes:** `contracts` (additive), `module-sdk` (additive), `core` (stageNarrate + adapter + config + audit), `docs`

## 1. Context

### Сегодня

Порт `NarrativeCritic` объявлен, но **мёртв**: контракт, индекс и цикл в ядре есть,
биндинга в `module-sdk` нет, а единственная ветка поведения — мгновенный отказ хода.

```ts
// packages/contracts/src/modules/extension-ports.ts — уже есть (L349-354)
export interface NarrativeCritic {
  critique: PortHandler<
    { prose: string; brief: JsonObject; draft: WorldState },
    { ok: true } | { ok: false; reason: string }
  >;
}
```

```ts
// packages/core/src/pipeline/turn-pipeline.ts — stageNarrate (L1537-1550)
for (const owned of this.index.narrativeCritics) {
  const critique = await owned.value.critique({ prose, brief, draft }, ...);
  if (!critique.ok) return critique;
  if (!critique.value.ok) {
    return err(failure("AGENT_FAILED", critique.value.reason, { causedBy: [owned.moduleId] }));
  }
}
```

`12-extension-surface.md §4.5` фиксирует: «любой hard fail → turn fail (rollback)».
Регистрация есть (`ContributionIndex.narrativeCritics`, `addNarrativeCritic`), но ни один
модуль не может её вызвать — SDK не предоставляет capability, манифест не имеет порта,
**retry-механики нет вообще**.

### Проблема, которую решает ADR

1. **Наказание игрока за проблемы модели.** Хард-гвард scene-controller (`SCENE_REPEAT_CAP`)
   отклоняет *ход игрока* до нарратива, когда сцена в жёстком цикле, а текст действия
   дословно повторяется. Игрок заблокирован из-за качества модели-нарратора — неприемлемо.
   Желаемое поведение: проблемы нарратора перехватывает **пост-генерационный семантический
   гейт**, который просит **переписать** (тот же контекст + неудачный пример + причина),
   а не убивает ход.
2. **Repair-механика существует только для схемы.** `StandardTaskLlmAdapter.execute`
   делает repair-цикл по инвалидному JSON (`maxRepairAttempts`), рендер через
   `buildNarrativeWriteRepairMessages(base, previousText, issues, hints, profile)` —
   `assistant` = неудачный вывод, `user` = профильные repair-шаблоны (`{{issues}}`, `{{hints}}`).
   Тот же транспорт годится для **семантических** замечаний критика.
3. **Порт уже задуман.** «post-LLM structured QA (continuity)» — в v1-дизайне поверхности
   ([12-extension-surface §4.5](../architecture/12-extension-surface.md)), traces уже
   резервируют «critic results if any» ([13-turn-tracing §5.7](../architecture/13-turn-tracing.md)).
   Воскрешение — закрытие заложенной розетки, а не новая стадия.

## 2. Decision

Оживить `NarrativeCritic`: **семантический гейт с циклом переписывания**.

```text
stageNarrate (narrative.write)                        ← существующий required standard task
    │
    ▼
requestAgent(task)                                    ← schema-repairs как раньше (внутри adapter)
    │  prose
    ▼
Critic loop (до maxNarrativeCriticRetries):
    critique( { prose, brief, draft, attempt }, ctx ) ← читаемые, read-only
    ├─ все ok        → принять prose, выйти из цикла
    └─ есть режект   → task = { ...task, repairRounds: [...prev, { prose, issues: reasons }] }
                       повторный requestAgent (тот же контекст + неудачный пример + причины)
    │
    ├─ бюджет исчерпан + criticPolicy "accept" (default) → принять последнюю prose + warn
    └─ бюджет исчерпан + criticPolicy "fail"            → AGENT_FAILED (rollback, no state change)
```

### Контракт критика (изменяемый)

```ts
// contracts/extension-ports.ts — NarrativeCritic.extend:
export interface NarrativeCritic {
  critique: PortHandler<
    {
      prose: string;          // текущий черновик (после schema-repair цикла)
      brief: JsonObject;      // тот же brief, что у задачи (включая narrativePromptSections)
      draft: WorldState;      // текущий черновик мира (read-only)
      attempt: number;        // 0-based номер раунда — критик может ослаблять/ужесточать
    },
    { ok: true } | { ok: false; reason: string }   // reason — причина для repair-сообщения
  >;
}
```

Порядок критиков: `(module.priority asc, registration order)` — как у всех owned-портов.
На раунде собираются **все** причины всех отклонивших критиков (сильнее сигнал для модели,
чем первый попавшийся).

### Транспорт repair-раундов

`AgentTask` (contracts, аддитивно) получает опциональный массив внешних repair-раундов:

```ts
// AgentTaskSchema + поле:
repairRounds?: readonly {
  prose: string;                    // неудачный вывод прошлой попытки («пример»)
  issues: string;                   // причины (join отрицательных вердиктов критика)
  hints?: readonly string[];        // опциональные подсказки
}[];
```

Рендер — через существующий механизм `StandardTaskLlmAdapter.buildRepairMessages`:
`repairRounds` применяются после базовых сообщений до schema-repair цикла, каждый раунд =
`assistant(неудачная проза)` + `user(repair-шаблоны профиля: title + instructions с
{{issues}}/{{hints}})`. Для `narrative.write` — ровно `buildNarrativeWriteRepairMessages`
(ADR 0007), т.е. **тот же контекст + неудачный пример + причины**, что и просил автор.

### Конфиг (core)

```ts
readonly agents: {
  ...existing,
  readonly maxNarrativeCriticRetries: number;   // default 2 (≤3 полных вызова narrative.write worst case)
  readonly criticPolicy: "accept" | "fail";     // default "accept"
}
```

- `maxNarrativeCriticRetries: 0` — порт работает как «жёсткий QA» (первый режект → policy),
  без переписывания. Совместимый способ вернуть старое поведение.
- `criticPolicy "accept"` (default): бюджет исчерпан → принимаем последний черновик +
  warn в log/trace. Игрок никогда не застревает из-за качества модели.
- `criticPolicy "fail"`: бюджет исчерпан → `AGENT_FAILED` (causedBy: модуль-критик),
  атомарно, без изменения состояния (06-turn-pipeline §5 «Narrative fail | no state change»).
  Для будущих строгих модулей (policy/continuity locks), которым нужна гарантия.

### Свойства

- **Atomicity не меняется:** весь цикл живёт внутри `stageNarrate`, до PROPOSE/VALIDATE/COMMIT.
  Критик — read-only момент: `op`/`deny`/`emit` запрещены (violation → стабильный код),
  как у `rules.soft`/`rules.guard`.
- **Пустая prose** остается аппаратным `AGENT_FAILED` (не переписывается критиками) —
  это инфраструктурная ошибка, не качество.
- **Streaming (решается в v1, не откладывается):** каждый раунд — новый полный вызов.
  Чтобы превью не смешивало тексты отвергнутого и принятого раундов:
  - `llm.stream.delta` получает поле `round` (0-based); дельта с `round` новее
    предыдущего означает «превью этого хода сбрасывается и пишется заново»;
  - `TurnContext.requestAgent(task, opts?: { round?: number; stream?: boolean })` —
    pipeline передаёт текущий номер раунда (`{ round }`); `stream: false` доступен хостам,
    которые предпочитают тихие ретраи (механизм есть, а не «на потом»);
  - внутренний буфер `narrativeStreamBuffers` (prose-экстракция) остаётся per-taskId и
    между раундами не чистится — на публикуемые дельты это не влияет;
  - контракт для UI/хостa нормативный: дельты — неавторитетное превью; финальный
    committed passage из turn result всегда авторитетен и заменяет превью целиком.
- **Трассировка:** `rawMeta` — `criticRounds`, `criticAccepted`; markdown trace — блок
  «critic results» (каждый раунд: причины), как и зарезервировано в 13-turn-tracing §5.7.

## 3. Non-goals

- Критика ответов **не-narrative** задач (tool-calling / прочие standard): гейт живёт в
  `stageNarrate`, там есть проза/brief/draft; транспорт `repairRounds` рендерится адаптером
  для всех standard задач, но **гейт-контракт `{prose, brief, draft}` — только для
  `narrative.write`** (остальные задачи прозы не имеют). Это граница скоупа, а не
  отложенная работа.
- LLM-критик в рантайме ядра: критика — функция модуля; ядро даёт транспорт, не суждение.
- Авто-калибровка бюджета раундов по жанру/каналу: один общий конфиг
  (`agents.maxNarrativeCriticRetries`), никакой канальной магии.
- Изменение `maxRepairAttempts`/schema-repair цикла — тот живёт внутри adapter как есть.

## 4. Considered alternatives (rejected)

| Альтернатива | Почему нет |
|--------------|------------|
| **Статус-кво: критика → turn fail** | Наказывает игрока за качество модели; «переписать» невозможно; порт остаётся мёртвым для scene-controller. |
| **Продолжить наказывать игрока через Guard (текущий SCENE_REPEAT_CAP)** | Rяд UX-претензий автора: блокировка входа не лечит выход модели из цикла; хочет переписывания вывода. |
| **Оживить порт без retry (один режект → policy)** | Тот же статус-кво плюс accept-фолбэк: качество не улучшается, переписывания нет — а автор явно запросил «тот же контекст + неудачный пример + перепиши». |
| **Семантическая валидация внутри adapter (LLM- или хук-цикл в execute)** | Привязало бы семантику narrative к нейтральному адаптеру; критику делает модуль, ядро даёт только транспорт. |
| **Stage-интерсептор `after:narrate` с `reject`** | Interceptor `reject` = один выстрел без retry-механики и без доставки причин обратно в промпт; не хватает merge-примитива «перезапусти задачу» (12-extension-surface §8.2). |
| **Принимать всегда + warning (без цикла)** | Дёшево, но не чинит корень: модель продолжит рециклиться; цикл дёшев (2 дополнительных вызова worst case) и закрывает подавляющее большинство случаев. |

## 5. Implementation sketch

### 5.1 New / changed files

```text
contracts/src/modules/extension-ports.ts      # NarrativeCritic: input += attempt (аддитивно)
contracts/src/agents/task.ts                  # AgentTaskSchema + repairRounds (optional); тип
contracts/src/turn/context.ts                 # requestAgent(task, opts?: { round?; stream? }) — аддитивно
module-sdk/src/types/capabilities.ts          # NarrativeCapability += critic(ctx) → NarrativeCritique
module-sdk/src/types/definition.ts            # (flows through NarrativeCapability; type only)
module-sdk/src/compile/normalize.ts           # narrative.critic в moments (moments.narrativeCritic)
module-sdk/src/compile/build-ir.ts            # moments.narrativeCritic → contributes "NarrativeCritic"
module-sdk/src/compile/bind-compiled-module.ts# binding: ctx.addNarrativeCritic({ critique }) read-only
module-sdk/src/compile/bindings.ts            # narratives capture critic (moments)
core/src/agents/standard-task-llm-adapter.ts  # buildInitialMessages: применить repairRounds до schema-цикла
core/src/agents/agent-orchestrator.ts         # execute/invoke принимают { round, stream }; emitStreamDelta публикует round
core/src/pipeline/turn-context.ts             # pass-through opts в requestAgent (обе обёртки)
core/src/pipeline/turn-pipeline.ts            # stageNarrate: critic loop (round/policy/config); host requestAgent + opts
core/src/config/types.ts / defaults.ts        # agents.maxNarrativeCriticRetries, agents.criticPolicy
core/src/tracing/turn-tracer.ts               # trace: criticRounds / criticAccepted / criticResults
core/src/tracing/markdown-renderer.ts         # markdown-блок «Critic results» по раундам
create-engine.ts                              # проброс config → pipeline
docs/architecture/06-turn-pipeline.md         # stage 7 NARRATE: critic sub-loop (retry, бюджет, policy)
docs/architecture/05-agents.md                # critic-порт, repair-раунды, конфиг
docs/architecture/12-extension-surface.md     # §4.5: «any hard fail → turn fail» → «reject+retry, policy»
docs/architecture/13-turn-tracing.md          # §5.7 «critic results»: раунды + причины, rawMeta поля
docs/architecture/08-configuration.md         # новые ключи agents.*
docs/adr/0008-narrative-critic-retry-loop.md  # этот документ
```

`NarrativeCritique` (SDK-тип, зеркалит результат порта):

```ts
export type NarrativeCritique =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };
```

Капибилити:

```ts
readonly critic?: (
  ctx: ModuleCtx<TSlice, TConfig>,
) => NarrativeCritique | null | undefined | Promise<NarrativeCritique | null | undefined>;
// null/undefined → трактуется как ok (критик «не заметил»)
```

Биндинг (паттерн `rules.soft`, read-only):

```ts
if (m.narrativeCritic) {
  for (const nar of bindings.narratives) {
    if (!nar.critic) continue;
    ctx.addNarrativeCritic({
      async critique({ prose, brief, draft, attempt }, turnCtx) {
        const { ctx: mctx } = baseCtx({
          turnCtx, world: draft, opMode: "collect",
          momentName: "narrative.critic", writeAllowed: false,
        });
        const res = (await nar.critic(mctx)) ?? { ok: true as const };
        if (res === null || res === undefined || res.ok) return ok({ ok: true as const });
        return ok({ ok: false as const, reason: res.reason });
        // violations → err(failure) со стабильным кодом (как rules.soft)
      },
    });
  }
}
```

### 5.2 stageNarrate: цикл (псевдокод)

```ts
const maxRetries = this.config.agents.maxNarrativeCriticRetries;
const policy = this.config.agents.criticPolicy;
let currentTask = task;
let prose = "";
for (let round = 0; round <= maxRetries; round++) {
  const result = await ctx.requestAgent(currentTask, { round, stream: true }); // schema-repairs внутри
  if (!result.ok) return err(...);                             // аппаратный fail — как было
  prose = String(result.data.prose ?? "");
  if (!prose) return err(failure("AGENT_FAILED", "narrative.write returned empty prose"));
  const reasons: string[] = [];
  let causedBy: string | undefined;
  for (const owned of this.index.narrativeCritics) {
    const critique = await owned.value.critique({ prose, brief, draft, attempt: round }, this.moduleCtx(owned.moduleId, ctx));
    // draft в critique = stateView сцены (read-only); brief = тот же, что у задачи
    if (!critique.ok) return critique;
    if (!critique.value.ok) {
      reasons.push(critique.value.reason);
      causedBy ??= owned.moduleId;
    }
  }
  if (reasons.length === 0) break;                              // принято
  if (round < maxRetries) {
    currentTask = {
      ...currentTask,
      repairRounds: [...(currentTask.repairRounds ?? []), { prose, issues: reasons.join("\n") }],
    };
    continue;
  }
  if (policy === "fail") {
    return err(failure("AGENT_FAILED", reasons.join("; "), { causedBy }));
  }
  this.log.warn({ causes: reasons }, "narrative critic budget exhausted — accepting draft");
  break;
}
scratch.narrativeProse = prose;
// rawMeta: criticRounds = round, criticAccepted = reasons.length > 0 && policy === "accept" && round === maxRetries
```

`requestAgent` вызывается с `{ round }` на каждой итерации (`stream` по умолчанию `true`).

### 5.3 Adapter: применять repairRounds в `buildInitialMessages`

```ts
let messages = this.buildInitialMessages(task);
for (const round of task.repairRounds ?? []) {
  messages = this.buildRepairMessages(task, messages, round.prose, round.issues, round.hints ?? []);
}
// дальше существующий schema-repair цикл (attempt ≤ maxRepairAttempts) — без изменений
```

`buildRepairMessages` для `narrative.write` уже рендерит `buildNarrativeWriteRepairMessages`
(профильные шаблоны с `{{issues}}`/`{{hints}}`, ADR 0007) — «тот же контекст + пример + причины».

### 5.4 Tests

core:
1. **round-trip**: скрипт LLM выдаёт «плохо → хорошо»; критик режектит первый черновик;
   assert: второй вызов содержит repair-раунд (assistant = первый prose, user = причины),
   финальная prose принята, `rawMeta.criticRounds === 1`.
2. **budget + accept (default)**: 3 плохих черновика при `maxNarrativeCriticRetries: 2` →
   ход коммитится с последним черновиком; warn в логе/trace.
3. **budget + fail**: то же при `criticPolicy: "fail"` → `AGENT_FAILED`, `causedBy` =
   модуль-критик, состояние не изменилось (no state change).
4. **attempt виден критику**: критик ослабляется на последнем раунде (режект только
   `attempt < 2`) → раунд 2 принимается.
5. **несколько критиков**: причины собираются обе; в repair-сообщении обе.
6. **порядок**: priority asc.
7. **repairRounds:0** → поведение «режект → policy» без переписывания.
8. **streaming раундов:** дельты второго раунда несут `round: 1` (клиент сбрасывает
   превью); при `opts.stream: false` ретрай не публикует дельты вовсе; финальный
   passage из turn result остаётся единственным авторитетным текстом.
9. **atomicity/goldens:** ретраи критиков не меняют `stream-prose`, `hello-turn`,
   `turn-trace.golden` при отсутствии критиков (setup-независимы).

module-sdk:
10. capability `narrative.critic` компилируется, биндится в `NarrativeCritic` порт,
    манифест содержит `"NarrativeCritic"`.
11. пишущие операции в `narrative.critic` → стабильный violation-код (read-only момент).
12. `null`/`undefined` из критика → ok.
13. `requestAgent(task, { round, stream })`: round доходит до оркестратора (дельта "round"), `stream: false` — без дельт.

### 5.5 Гейты

`typecheck`, core-тесты (включая golden), `test:module-boundaries`,
`test:modules-stress` / `test:compat` (contracts schema добавлен аддитивно).

## 6. Security model (явно)

- Критик — **read-only момент**: `op`/`proposeOp`/`emit`/`deny` → fail-loud со стабильным
  кодом, как `rules.soft`. Модуль не может менять мир «через критику».
- `repairRounds[].issues` — только тексты причин от авторизованных модулей (тем же правам,
  что sections/guards). Проза предыдущей попытки — уже существующая модель-вывод в рамках
  задачи; в repair-сообщении она появляется в той же роли, что и в schema-repair.
- Бюджет раундов конечен и контролируется конфигом (default 2) — нет unbounded loop;
  `criticPolicy` решает судьбу остатка (accept=не блокировать ход, fail=блокировать).
- Trace: причины критиков — модульный текст, без raw-секретов; policy `tracing.includePrompts`
  сохраняется (раунды рендерятся в сообщениях, значит под красакт-фильтрами как обычно).

## 7. Consequences

### Positive

- **Игрок больше не наказывается за качество модели**: плохой черновик нарратора
  переписывается (тот же контекст + неудачный пример + причины), при исчерпании бюджета
  ход по умолчанию живёт (accept + warn).
- Закрывается заложенная в v1 розетка (12-extension-surface §4.5 уже упоминает «post-LLM
  structured QA»; traces резервируют critic results) — «механизм core» без новой стадии.
- Повторное использование repair-транспорта/шаблонов ADR 0007 — ноль новых промпт-механик.
- **Первый потребитель — scene-controller**: детерминированный критик (без доп. LLM-вызова):
  при `loopLevel === "hard"` и прозе, повторяющей предыдущий исход, — режект с причиной;
  хард-гвард игрока упраздняется. Второй запланированный модуль получит тот же порт.
- **Streaming решён в v1, ничего не отложено**: round-маркер в `llm.stream.delta` +
  контракт «дельты — превью, passage — авторитет» дают UI-чистое переписывание
  (сброс превью при новом раунде) без потери real-time стрима.
- Общий механизм для любых critical-консьюмеров (continuity, policy).

### Costs / risks

- Core change (ADR-гейт соблюдён): stageNarrate, adapter, конфиг, audit meta, docs.
- Стоимость токенов: worst case `1 + maxNarrativeCriticRetries` полных вызовов
  narrative.write на ход (default 3) — инцидентно, только при повторных режектах.
- Латентность хода в worst case растёт на ретраи × время вызова.
- **UI-контракт обновляется**: клиенты потоков должны учитывать `round` в `llm.stream.delta`
  (сброс превью при смене round) — это часть этого ADR, не «потом» (host-bootstrap/docs).
- `12-extension-surface §4.5` меняет «any hard fail → turn fail» на «reject+retry+policy» —
  зафиксировано этим ADR; порт остаётся read-only и атомарным.

### Compatibility

- Аддитивно: `AgentTask.repairRounds` optional; `NarrativeCritic.input.attempt` optional
  по смыслу (старые имплементации порта — нет таких — совместимы).
- Нет модулей, использующих критик сегодня → никакого обратного влияния на существующие сборки.
- `maxNarrativeCriticRetries: 0` = полный откат к «режект → policy» без цикла.
- Конфиги без новых ключей работают (defaults: retries 2, policy accept).
- SDK: новая capability аддитивна; существующие модули не обязаны её объявлять.

## 8. Relationship to other ADRs

| ADR | Relation |
|-----|----------|
| 0001 CPA | `narrative.write` остаётся required standard task; цикл критиков — внутри stageNarrate, atomic boundary не меняется. |
| 0004 Module SDK | SDK расширяется одной аддитивной capability `narrative.critic` (read-only момент). |
| 0005 Moments-native | Новый read-only момент `narrative.critic`; паттерн violation-кодов как у `rules.soft`. |
| 0007 Prompt profiles | repair-шаблоны профиля переиспользуются для семантических раундов (`{{issues}}/{{hints}}`, `assistant` = неудачный пример). |
| 0006 Module discovery | Модули (scene-controller, будущий) подключаются как обычно; порт объявляется в манифесте. |

## 9. Checklist (Accepted — имплементировано 2026-08-27)

- [x] contracts: `NarrativeCritic` input += `attempt`; `AgentTaskSchema` += `repairRounds`;
      `TurnContext.requestAgent(task, opts?: { round?; stream? })`
- [x] module-sdk: `narrative.critic` capability + `NarrativeCritique` + манифест-порт + read-only binding
      (входы порта автору — через `ctx.meta: { prose, brief, attempt }`)
- [x] core: stageNarrate critic loop (раунды, сбор причин, бюджет, policy, `{ round }` в requestAgent)
- [x] core: adapter применяет `repairRounds` в `buildInitialMessages`
- [x] core: `agents.maxNarrativeCriticRetries` (2) / `agents.criticPolicy` ("accept") + defaults + create-engine
- [x] core: `llm.stream.delta` += `round`; `stream: false` per-call; trace-поля `criticRounds/criticAccepted`;
      markdown-блок «Critic results» по раундам
- [x] Тесты §5.4 (core + sdk); золотые green
- [x] docs: 05-agents / 06-turn-pipeline / 12-extension-surface / 13-turn-tracing / 08-configuration
- [x] Гейты: typecheck, core-тесты, boundaries, compat
- [x] Этот ADR → Accepted; ADR-таблицы (root README, 00-overview) обновлены

## 10. References

- Порт и цикл прожекта: `packages/contracts/src/modules/extension-ports.ts` (L349-354),
  `packages/core/src/registry/contribution-index.ts` (L125-129), `register-context.ts` (`addNarrativeCritic`),
  `packages/core/src/pipeline/turn-pipeline.ts` (stageNarrate L1537-1550)
- Schema-repair цикл: `packages/core/src/agents/standard-task-llm-adapter.ts` (`execute`, `buildRepairMessages`),
  `packages/core/src/agents/prompts/narrative-write.ts` (`buildNarrativeWriteRepairMessages`)
- Профили промптов / repair-шаблоны: `docs/adr/0007-narrative-prompt-profiles.md`, `data/prompts/narrative@1.0.1.json`
- SDK-биндинги: `packages/module-sdk/src/compile/bind-compiled-module.ts` (narrative L722-810),
  `packages/module-sdk/src/compile/build-ir.ts` (contributes L116-142)
- Транспорт задач: `packages/contracts/src/agents/task.ts` (`AgentTaskSchema`)
- requestAgent + opts threading: `packages/contracts/src/turn/context.ts`,
  `packages/core/src/pipeline/turn-context.ts`, host requestAgent (`turn-pipeline.ts` L269, `session-runtime.ts`)
- Streaming дельты: `packages/core/src/agents/agent-orchestrator.ts` (`emitStreamDelta` → `llm.stream.delta`,
  `narrativeStreamBuffers`, `streamOpts`)
- Пайплайн/atomicity: `docs/architecture/06-turn-pipeline.md` (§4 stage 7, §5)
- Трассировка: `docs/architecture/13-turn-tracing.md` (§5.7 critic results)
- Обидчик UX: scene-controller hard-stop guard (`packages/modules/scene-controller/src/index.ts`, `guidance.ts`)