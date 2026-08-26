# ADR 0007: Versioned narrative prompt profiles (JSON packs, model-mapped)

> **Status:** Accepted — implementation merged (core 1.x, additive)
> **Date:** 2026-08-26
> **Depends on:** [ADR 0001](./0001-contracted-pipeline.md) (narrative.write as required standard task),
> [01-principles](../architecture/01-principles.md) §6 (post-release core-change rule),
> [specs/07 §11](../specs/07-release-and-versioning.md) (core change requires bugfix / ADR / SDK-inexpressible proof)
> **Does not change:** author API (`defineModule` / CBMD), `module-sdk`, `contracts`,
> atomic turns, `NarrativeWriteOutputSchema` / JSON contract `{prose, meta}`, streaming /
> repair-loop / rollback, extension surface ([12-extension-surface.md](../architecture/12-extension-surface.md))

## 1. Context

### Сегодня

Narrative-промпт — жёсткие RU-строки в core, `packages/core/src/agents/prompts/narrative-write.ts`:

- `buildNarrativeSystemCore` — системное ядро (~75 строк: JSON-контракт, craft-правила, NPC, мир);
- `buildRulesReminder` — памятка рассказчику;
- `buildNarrativeWriteRepairMessages` — repair-текст;
- `PLAYER_ACTION_LABEL`, `buildLengthGuidance`, `buildCoreNarrativePromptSections` — динамические куски (locale, style, policy).

Модули подмешивают секции через `NarrativePromptContributor` (channel `system`/`user`),
но системное ядро всегда приклеивается поверх из core (`stageNarrate` → `buildNarrativeWriteMessages`).

### Почему это трение (а не «дизайн-каприз»)

1. **Промпт привязан к модели.** Разные модели по-разному работают с system-промптом;
   смена модели требует практически полного переписывания промпта для качественного нарратива.
2. **Файнтюн идёт постоянно.** Каждая правка промпта в core = релиз core — противоречит
   P1 («core is boring and stable») и post-release правилу (spec 07 §11.3: core меняется только
   по bugfix / ADR / SDK-inexpressible).
3. **Нужно сравнение вариаций.** Держать несколько вариаций для одной модели, гонять одинаковый
   сценарий, сравнивать через внешний evaluator (сам evaluator — вне скоупа этого ADR; здесь —
   только данные для него: стабильный идентификатор `promptProfile` в audit/trace).

## 2. Decision

Ввести **NarrativePromptProfile** — версионированный JSON-пак промпта для `narrative.write`,
живущий **вне core** (файлы) с built-in fallback. Core один раз получает *механизм*
(registry + резолвер + подстановку), дальше правки промпта = правка файла, без релизов core.

```text
Профиль (JSON): id + version + labels + systemCore + rulesReminder + repair + constraints
Источники:      built-in default@1.0.0 (текущий текст 1:1) ⊕ файлы RP_PROMPTS_DIR (default data/prompts/)
Выбор:          per-session, на boot: agents.promptProfiles[modelAlias] → agents.defaultPromptProfile → default@1.0.0
                env RP_NARRATIVE_PROMPT_PROFILE = quick override (эксперименты)
Audit/trace:    promptProfile: "id@version" в rawMeta + structured log + markdown trace
```

### Контракт профиля (normative)

```jsonc
// data/prompts/narrative@2.0.0.json
{
  "id": "narrative",
  "version": "2.0.0",
  "description": "tuned for gpt-4o",          // optional
  "labels": {
    "playerAction": "Действие игрока:"
  },
  "systemCore": "… {{locale}} … {{lengthGuidance}} … «{{playerActionLabel}} …» …",
  "rulesReminder": "---\nСлужебная памятка рассказчику …",
  "repair": {
    "title": "Предыдущий JSON не прошёл проверку схемы.",
    "instructions": ["Исправь и верни ТОЛЬКО валидный JSON…",
                     "Проблемы валидации: {{issues}}"],
    "hintsTitle": "Дополнительные подсказки:"
  },
  "constraints": {                              // optional; дефолты core при отсутствии
    "temperature": 0.7,
    "maxRepairAttempts": 1
  }
}
```

### Плейсхолдеры (закрытый словарь)

`{{locale}}`, `{{lengthGuidance}}`, `{{playerActionLabel}}`, `{{issues}}`, `{{hints}}`.

Любой другой `{{…}}` → `CONFIG_INVALID` на boot. **Кода в промптах нет** — это данные,
бан №5 (eval / dynamic code load) соблюдён: подстановка по фиксированному словарю, без исполнения.

### Залоченные решения

| # | Решение |
|---|---------|
| D1 | Профиль = один JSON-файл `{id}@{version}.json`; имя файла должно совпадать с полями `id`/`version` (иначе `CONFIG_INVALID` — исключает путаницу между вариациями). Валидация — zod-схема, `version` = semver. |
| D2 | Источники: built-in `default@1.0.0` (текущий текст из `narrative-write.ts` 1:1, всегда доступен — тесты/CI/совместимость) ⊕ файлы из `RP_PROMPTS_DIR`. Файл с `id@version`, совпадающим с built-in → `CONFIG_INVALID`; изменённый дефолт = новый `version` (`default@1.1.0`) + явный выбор в конфиге. Дубль `id@version` между файлами → `CONFIG_INVALID` (оба пути в details). Сканируется только верхний уровень `RP_PROMPTS_DIR` (`*.json`, **не рекурсивно**; подпапка `examples/` не сканируется). Git-политика как у `data/stories` ([11-repository-structure §6](../architecture/11-repository-structure.md)): примеры tracked, приватные локальные профили — gitignored. Несуществующая **явно заданная** директория → `CONFIG_INVALID`; несуществующая дефолтная → warning + только built-in (boot ok). |
| D3 | Выбор **per-session**: резолв на boot. `agents.promptProfiles: Record<modelAlias, "id@version">`; нет записи для `agents.defaultModel` → `agents.defaultPromptProfile` (default `"default@1.0.0"`). `RP_NARRATIVE_PROMPT_PROFILE` (env) побеждает оба — быстрый эксперимент без правки конфига. Неизвестный `id@version` → `CONFIG_INVALID` (fail boot; никакого тихого подхвата «похожего» профиля). |
| D4 | Профиль влияет **только на текст промпта и дефолтные constraints** `narrative.write`. JSON-контракт `{prose, meta}`, schema, repair-loop, streaming, rollback, сборка brief/sections — не меняются. `task.constraints` (явные в задаче) побеждают дефолты профиля. |
| D5 | Секции `NARRATIVE STYLE` / `CONSTRAINTS` и генерация `lengthGuidance` остаются **механикой core** (порождаются turn-данными style/policy); в профиль выносится только текст, включая плейсхолдер `{{lengthGuidance}}`. |
| D6 | Audit/trace: `promptProfile: "id@version"` (строка, без секретов) в `rawMeta` (`buildLlmAuditMeta`), в structured log audit fields и в turn markdown trace — в заголовке «Agent task» (рядом с `model` / `constraints`, [13-turn-tracing §5.4](../architecture/13-turn-tracing.md)) и в NarrativeBrief. `model` уже там — evaluator сопоставляет пару (model, promptProfile). Поле добавляет core: trace принадлежит core, modules могут только annotate ([13-turn-tracing §1](../architecture/13-turn-tracing.md)). |
| D7 | Механизм распространяется только на `narrative.write`. `action.interpret` и другие стандартные task types — та же схема позже, отдельной задачей (ADR не запрещает; просто не в скоупе). |
| D8 | Per-turn переключение профиля (поле в turn-запросе / `AgentTask.input`) — **не входит** в v1: ломает совместимость history при смене system между ходами. Контракт `AgentTask` не меняется. |

## 3. Non-goals

- Per-turn override профиля (D8; контракт AgentTask остаётся).
- Модульные / community паки (второй источник в тот же registry — future work, отдельной задачей).
- Авто-подбор профиля «по модели» без явного маппинга в конфиге (маппинг явный, fail-fast).
- Изменение контракта ответа, схем, repair-loop, streaming, rollback — профиль меняет только контент.
- Hot-reload / fs-watch промптов (перезапуск движка; watch — no, как D10 в ADR 0006).
- Сам evaluator (вне скоупа; здесь только поле `promptProfile` для него).

## 4. Considered alternatives (rejected)

| Альтернатива | Почему нет |
|--------------|------------|
| **Статус-кво: промпт в core, правки через релизы** | Постоянные релизы core; противоречит P1 и spec 07 §11.3. |
| **TS-функции (промпт как код) в отдельном пакете** | Промпт = код: диффы вариаций читаются хуже; правка = сборка/инсталляция пакета; для персонального файнтюна это лишний шаг. |
| **Модуль-пак как единственный источник** | Похоже на предыдущее, плюс semver-пакет ради каждой правки промпта. Оставлен как future второй источник в тот же registry (D2 совместим). |
| **Полный вынос narrative-агента из core (task type модуля через `AiTaskDef.messages`)** | Ломает standard-task семантику: streaming prose-дельт (живёт в orchestrator), сборка brief/sections, repair-hints, required-fail-turn. Регресс ради версионирования контента. Версионируется контент, а не механизм. |
| **YAML/TOML вместо JSON** | JSON + zod достаточны; меньше форматов, диффы строк одинаково читаются. |

## 5. Implementation sketch

### 5.1 New files

```text
packages/core/src/agents/prompts/profile-types.ts          # zod-схема + типы NarrativePromptProfile
packages/core/src/agents/prompts/placeholder-resolver.ts   # KNOWN_PLACEHOLDERS + resolve(text, ctx)
packages/core/src/agents/prompts/builtin-default-profile.ts# default@1.0.0 — текущий текст как данные (1:1)
packages/core/src/agents/prompts/profile-registry.ts       # load(dir) + getProfile(ref) + resolveForModel(...)
packages/core/tests/prompt-profile-registry.test.ts
packages/core/tests/prompt-placeholder-resolver.test.ts
packages/core/tests/narrative-profile-integration.test.ts
data/prompts/README.md                                     # как написать профиль + пример
data/prompts/examples/narrative@0.0.0-example.json        # пример (подпапка examples/ не сканируется)
docs/adr/0007-narrative-prompt-profiles.md                 # этот документ
```

`NarrativePromptProfile` (логический контракт):

```ts
interface NarrativePromptProfile {
  id: string;
  version: string;                          // semver
  description?: string;
  labels: { playerAction: string };
  systemCore: string;                       // шаблон с плейсхолдерами
  rulesReminder: string;                    // шаблон
  repair: {
    title: string;
    instructions: string[];                 // {{issues}} в одной из строк
    hintsTitle: string;
  };
  constraints?: { temperature?: number; maxRepairAttempts?: number };
}
```

### 5.2 Touchpoints

| Файл | Изменение |
|------|-----------|
| `standard-task-llm-adapter.ts` | принимает резолвнутый profile + `promptProfileRef`; `buildNarrativeWriteMessages(task, profile)`; `constraints` профиля как дефолт (если в задаче не заданы) |
| `llm-audit-meta.ts` | опциональное поле `promptProfile` в `buildLlmAuditMeta` |
| `turn-pipeline.ts` (`stageNarrate`) | `promptProfile` в brief (для markdown trace) |
| `create-engine.ts` + `config/types.ts` / `defaults.ts` | `agents.promptProfiles`, `agents.defaultPromptProfile`; резолв на boot через registry |
| `host-bootstrap` (`env.ts`) | `RP_PROMPTS_DIR`, `RP_NARRATIVE_PROMPT_PROFILE` parse + передача в EngineConfig |
| `narrative-write.ts` | строки ядра/памятки/repair/labels заменяются на profile; секции-механика (style/constraints) и `lengthGuidance`-резолвер остаются |
| `docs/architecture/05-agents.md`, `08-configuration.md` | описание профилей, env, правила выбора |
| `docs/architecture/13-turn-tracing.md` | `promptProfile` в §5.4 «Agent calls» (заголовок Agent task) |
| `docs/architecture/11-repository-structure.md` | `data/prompts/` в §6 (примеры tracked, приватные gitignored) |
| root `README.md` / `00-overview.md` | ADR-таблица |

### 5.3 Tests (core)

1. **registry**: валидный файл грузится; невалидный JSON / неизвестный плейсхолдер / дубль `id@version` / несовпадение имени файла → `CONFIG_INVALID`; пустая директория → только built-in `default@1.0.0`.
2. **resolver**: маппинг по модели, fallback на `defaultPromptProfile`, env-оверрайд, неизвестный `id@version` → fail.
3. **placeholder**: подстановка всех пяти плейсхолдеров; неизвестный → ошибка; пустая строка → без изменений.
4. **narrative-write**: кастомный профиль даёт свои system/user/repair messages; `default@1.0.0` даёт **текст, побайтово идентичный текущему** (golden).
5. **интеграция**: выбранный профиль попадает в `rawMeta.promptProfile`; существующие `hello-turn`, `llm-narrative-path`, `narrative-history`, `stream-prose`, `turn-trace.golden` — зелёные без правок.

### 5.4 Гейты

`test:compat` / `test:modules-stress` / `test:module-boundaries` / `test:scaffold-smoke` не
затрагиваются (sdk/contracts не меняются). Обязательны: `typecheck`, core-тесты (включая golden).
Релиз: **core minor** (аддитивно; дефолтный профиль = текущий текст → поведение по умолчанию не меняется).

## 6. Security model (явно)

- Профили — **операторская конфигурация** (`RP_PROMPTS_DIR` / `data/prompts/`), как `RP_LLM_API_KEY`:
  не пользовательский ввод; доверенный локальный контент (git repo / развёрнутая инсталляция).
- JSON — **данные, не код**: плейсхолдеры из закрытого словаря, без eval/динамической загрузки
  (бан №5). Поле `description`/тексты не интерпретируются.
- `promptProfile` в audit/trace — только `id@version` (не пути, не содержимое). Полный текст промпта
  в traces — под существующей политикой `tracing.includePrompts` (redact-фильтры не меняются).
- Неизвестный профиль в конфиге → fail boot, а не «подхват похожего»: оператор не должен получить
  молча другой промпт, чем настроен (P9 fail fast).

## 7. Consequences

### Positive

- Правки промпта = правка JSON-файла + перезапуск: **ноль релизов core** (P1, spec 07 §11.3 соблюдены).
- Сравнение вариаций: файлы рядом, `git diff` показывает изменения; переключение — env/конфиг.
- Смена модели: меняется одна запись `agents.promptProfiles[modelAlias]`, а не текст промпта.
- Данные для внешнего evaluator: стабильное поле `promptProfile` в audit/trace рядом с `model`.
- Built-in `default@1.0.0` = текущий текст 1:1: поведение по умолчанию, тесты и CI не меняются.

### Costs / risks

- Разовое изменение core (registry + резолвер + адаптация adapter) — в пределах «минимального
  core change»: механизм добавляется один раз, дальше контент — файлы.
- Новый источник конфигурации (`RP_PROMPTS_DIR`): оператор деплоя должен знать про директорию;
  документируется в 08-configuration.
- Плейсхолдеры — закрытый словарь: новую динамическую вставку в промпт можно добавить только
  изменением core (осознанно; контентные потребности закрываются текстом профиля).

### Compatibility

- Конфиги без новых полей работают как раньше (`default@1.0.0`).
- `AgentTask` / brief / output schemas не меняются; traces сохраняют структуру (добавляется поле).
- Модули (sections через `NarrativePromptContributor`) продолжают работать: профиль меняет ядро,
  секции модулей мержатся поверх как раньше.
- Релиз: core minor; `module-sdk`/`contracts` не трогаются.

## 8. Relationship to other ADRs

| ADR | Relation |
|-----|----------|
| 0001 CPA | `narrative.write` остаётся required standard task; профиль меняет только контент промпта, не pipeline/commit. |
| 0004 Module SDK | Не затрагивается: профили — не module API; sections-порт модулей работает без изменений. |
| 0005 Moments-native | Независим: это контент-механизм core; моменты-ривайт не затрагивается (и наоборот). |
| 0006 Local module discovery | Независим; потенциальный future-источник профилей (модульный пак) — отдельная задача. |

## 9. Checklist (Implemented)

- [x] `profile-types` / `placeholder-resolver` / `builtin-default-profile` (текст 1:1 с текущим — golden-тесты зелёные)
- [x] `profile-registry`: загрузка `RP_PROMPTS_DIR`, D1–D3 валидации, fallback на `default@1.0.0`
- [x] Адаптация `standard-task-llm-adapter` + `llm-audit-meta` + `stageNarrate` (brief.promptProfile)
- [x] `agents.promptProfiles` / `agents.defaultPromptProfile` / `agents.promptProfileOverride` / `agents.promptProfilesDir` + `RP_PROMPTS_DIR` / `RP_NARRATIVE_PROMPT_PROFILE` (host-bootstrap)
- [x] Тесты §5.3; существующие core-тесты (включая golden) зелёные (89/89)
- [x] Доки: 05-agents, 08-configuration, data/prompts/README + example, .gitignore
- [x] Гейты: typecheck + core tests + host-bootstrap tests зелёные (compat/stress/boundaries не затрагиваются — sdk/contracts не менялись)
- [x] Этот ADR → Accepted → Implemented + дата; ADR-таблицы в root README и 00-overview обновлены

## 10. References

- Narrative-промпт сегодня: `packages/core/src/agents/prompts/narrative-write.ts`
- Standard task adapter: `packages/core/src/agents/standard-task-llm-adapter.ts`
- Orchestrator (streaming/repair/rollback): `packages/core/src/agents/agent-orchestrator.ts`
- Сборка brief/sections: `packages/core/src/pipeline/turn-pipeline.ts` (`stageNarrate`)
- Audit meta: `packages/core/src/agents/llm-audit-meta.ts`
- Конфиг: `packages/core/src/config/types.ts` / `defaults.ts`, `docs/architecture/08-configuration.md`
- Tracing: `docs/architecture/13-turn-tracing.md` (§5.4 agent calls, §1 core-owned)
- Core границы и minimal built-ins (adapter selection без сюжетной логики): `docs/architecture/02-core.md` (§6)
- NARRATE стадия и atomicity: `docs/architecture/06-turn-pipeline.md` (§4 stage 7), `docs/architecture/04-state-and-commands.md`
- Репозиторий / git-политика data: `docs/architecture/11-repository-structure.md` (§6)
- Обзор и ADR-таблица: `docs/architecture/00-overview.md`
- Core-change rule: `docs/architecture/01-principles.md` §6, `docs/specs/07-release-and-versioning.md` §11
