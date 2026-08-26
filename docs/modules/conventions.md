# Module Conventions (normative — Platform 1.0)

> Правила совместной жизни десятков модулей: composition, ordering,
> readModel, events, lifecycle, public contracts.  
> Связанное: [compatibility.md](./compatibility.md) · [errors.md](./errors.md) ·
> [sdk-reference](./sdk-reference.md) · [specs/04](../specs/04-host-composition.md) ·
> [specs/06](../specs/06-inter-module-and-sdk-gaps.md).

## 1. Inter-module rules

1. **Нет module→module runtime deps** — CI `test:module-boundaries` fail.
   Связи только данные-driven: `provides`/`requires`, readModel, events.
2. Свой slice — ед. поверхность записи; чужой slice — только
   `access.read` (объявлен в `access`) или readModel.
3. `provides`/`requires` — capability tokens (`capability:<token>`);
   **unversioned в 1.0** (versioned tokens — post-1.0). Duplicate
   `provides` **разрешён** (spec 06 §5.1): граф трактует токен как
   удовлетворённый при наличии ≥1 провайдера; порядок провайдеров =
   registration order (см. §3). Breaking-изменение семантики capability =
   MAJOR модуля + обновление public contract.
4. Public contract — обязательная секция README каждого модуля (см. §5).

## 2. Priority bands

| Band | priority | Use |
|------|----------|-----|
| 0–9 | infra | memory, time |
| 10–29 | world facts | canon (15), character (20), working-memory (10) |
| 30–59 | entities | npc, inventory |
| 60–79 | systems | combat, plot |
| 80–99 | presentation | status |
| 100+ | default | low (default 100) |

First-party: working-memory = 10, world-canon = 15, character = 20.

## 3. Registration order + tie-break (normative)

- **Позиция в resolved списке** (`base ++ extraModules`, spec 04 §4.1.1) —
  детерминированный tie-break при равных `priority` во **всех**
  order-sensitive поверхностях:
  narrative sections, turn moments, event dispatch (§4), init/shutdown (§6).
- Никогда Map/random порядок.

## 4. Events norms (spec 06 §7)

- Canonical name: `<moduleId>` (`-` → `_`) + `.` + local kebab name.
  Pattern валидируется при define (invalid → `MODULE_DEFINE_INVALID`).
- **Один publisher на имя** — duplicate → boot fail `MODULE_EVENT_DUPLICATE`.
- Subscribe: canonical (dot-полное) имя; `priority` asc → registration order.
- Подписка на несуществующее имя:
  - publisher загружен → boot fail `MODULE_EVENT_UNKNOWN` (typo);
  - publisher не загружен и нет `requires` → boot **warning** + инертна;
  - publisher не загружен и `requires` есть → `MODULE_REQUIRES_MISSING`.
- Dispatch: только `turn.committed` / `turn.rejected` / `event.dispatch`.
  Payload валидируется publisher schema (E18).
- Хендлеры **observe-only**: readModel/readSlice/свой slice — ok;
  `ctx.op`/`proposeOp` → E15; `deny()` → E20; `scheduleSystem` — ok;
  `emit` — ok (каскад, caps E22/E23).
- Caps: `MODULE_EVENT_MAX_CASCADE_DEPTH = 8`, `MODULE_EVENT_MAX_BURST_PER_TURN = 256`.
- События эфемерны (turn-scoped), не пишутся в save; подписки статичны.
- События **не** канал мутации мира.

## 5. Public contract section (README каждого модуля)

```markdown
## Public contract
- id / version / priority
- provides / requires
- slice name + schemaVersion
- meta keys (seed)
- config key
- readModels
- events (emitted: name + purpose; subscribed)
- system reasons / task types / tools
```

Каталог readModels и events обязателен: вызывающая сторона читает каталог
провайдера до вызова (spec 06 §6.5).

## 6. readModel providing norms (spec 06 §6.5)

| Rule | Value |
|------|-------|
| Name pattern | `<moduleId>` (`-` → `_`) + `.` + local kebab name; регистрация — только из своего модуля |
| Args schema | optional; валидируется на каждый вызов; fail → `MODULE_READ_MODEL_ARGS_INVALID` (caller moduleId, model name, zod path) |
| Return | plain `JsonObject` |
| Break policy | изменение имени/shape/args readModel = **MAJOR** модуля + public contract update; имена стабильны в рамках MAJOR |
| Errors | вызов чужого readModel: обёрнутый failure с details (caller moduleId, name); провайдер не узнаёт о caller'е |

## 7. Lifecycle (spec 06 §8)

- `init(ctx)` — once после boot-валидации, **до** первого turn; без
  world-доступа (op/emit/deny/readModel/access → fail-loud
  `MODULE_MOMENT_OP_FORBIDDEN`, message указывает `init`); ordering — priority
  asc, sequential; failure → boot fail `MODULE_INIT_FAILED` (E24).
- `shutdown()` — при stop, **reverse priority**; cleanup only; error →
  warning `MODULE_SHUTDOWN_ERROR` (E25); stop не валится.
- init/shutdown не пишут в save.

## 8. Config & secrets (spec 04 §4.6)

- `moduleConfig` — **не** канал для секретов (значения видны в конфиг-дампах/
  логах/error-контексте) — api keys запрещены.
- Secrets: process env, читается кодом модуля напрямую; host не проксирует
  env в модули в 1.0.
- Значения конфига/секретов не появляются в failure details (errors.md §Shape).

## 9. Host composition (минимум для автора)

```bash
RP_MODULE_PROFILE=minimal            # working-memory only
RP_MODULES=working-memory,character  # replaces profile set (list order)
RP_DISABLE_MODULES=character         # removes after resolution
```

Детали: [specs/04](../specs/04-host-composition.md) ·
[08-configuration](../architecture/08-configuration.md).