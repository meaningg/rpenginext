# ADR 0006: Local module discovery (zero-wiring module pool)

> **Status:** Accepted — implementation merged (host-bootstrap 1.x, additive)  
> **Date:** 2026-08-26
> **Depends on:** [ADR 0004](./0004-module-sdk-cbmd.md) (Module SDK / IR as the single install path),
> [specs/04](../specs/04-host-composition.md) (host composition precedence, normative 1.0)
> **Does not change:** author API (`defineModule` / CBMD, frozen at SDK 1.0), core, contracts,
> IR (`MODULE_IR_VERSION`), atomic turns, precedence table of specs/04 §4.1.1

## 1. Context

### Сегодня

Композиция собирается на boot из пула id (`MODULE_CATALOG` ⊕ discovery) + `extraModules`:

- **First-party** — статический `MODULE_CATALOG` в `packages/host-bootstrap/src/module-catalog.ts`
  (компиляционно известные id) → адресуются из env (`RP_MODULES`, `RP_MODULE_PROFILE`,
  `RP_DISABLE_MODULES`) и опций (`enabledModuleIds` / `disabledModuleIds`).
- **Остальные** (create-module, внешние, локальные) — пакеты с полем `rpengineext.module`
  в скан-рутах (`moduleDirs` / `RP_MODULE_DIRS`, дефолт `packages/modules`) → попадают в пул
  через discovery (`resolvePool`; каталог побеждает при коллизии id) и адресуются по id так же.
- `extraModules` — append после отбора: только CLI-фикстура за флагом `--fixture`
  (`apps/cli/src/main.ts`); `apps/api/src/main.ts` `extraModules` не передаёт.

### Почему это трение (а не «дизайн-каприз»)

`RP_MODULES=mood` — строка из env; строка **не может импортировать код**. Отбор по id из env
требует, чтобы host знал модуль на этапе компиляции. Поэтому у не-first-party модулей нет
id-адресации, пока они не вшиты в host-bootstrap.

С ростом числа модулей (десятки) это даёт:

1. копипаста-вставку в точку входа (N модулей = N строк кода у хоста);
2. открытый разрыв «строки env» против «строк кода» между first-party и остальными;
3. правка `host-bootstrap` на каждый новый модуль, если хочется env-селекции.

## 2. Decision

Ввести **локальный discovery модулей** на уровне host-bootstrap:

```text
Каждый модуль в репозитории декларирует себя в своём package.json
  ("rpengineext.module": { entry, factory })
Host на boot сканирует настроенные каталоги → строит id-пул
  (MODULE_CATALOG + discovered, catalog имеет приоритет)
Selection остаётся прежним и работает по id из пула:
  RP_MODULES / enabledModuleIds / profiles / options.modules
0 строк кода в host: wire = env/конфиг, а не код.
```

**Ключевая семантика — пул, а не авто-включение:**

- discovery **делает модули адресуемыми по id**, но **не загружает их автоматически**;
  включение остаётся явным (env/опции). Дефолтный boot не меняется (`core-book`).
- Смысл «без единой строки кода»: модуль, положенный в `packages/modules/`, подключается
  через `RP_MODULES` / `enabledModuleIds` без каких-либо правок кода хоста или каталога.

### Дискавери-контракт (normative)

Каждый кандидат — каталог внутри скан-рута, содержащий `package.json`:

```jsonc
// packages/modules/mood/package.json
{
  "name": "@rpengineext/module-mood",
  "version": "1.0.0",
  "rpengineext": {
    "module": {
      "id": "mood",                    // optional: default = package name minus scope/`@rpengineext/module-` prefix
      "entry": "./src/index.ts",       // required: путь от корня пакета
      "factory": "createMoodModule",   // required: именованный экспорт фабрики () => Module
      "description": "..."             // optional: hint для MODULE_UNKNOWN
    }
  }
}
```

- Host делает `await import(<resolve(pkgDir, entry)>)` → `factory()` только для **выбранных**
  id (лениво; невыбранные модули не импортируются вообще — быстрее boot, меньше поверхность ошибок).
- Относительный entry не требует workspace-линковки `node_modules` — работает и в собранных
  деплоях, где модули разложены рядом с хостом.

### Залоченные решения

| # | Решение |
|---|---------|
| D1 | Discovery строит **пул id**; включение остаётся явным (D1a: дефолт = `core-book`, не «все модули»). |
| D2 | Скан-руты: хост-опция `moduleDirs` + env `RP_MODULE_DIRS` (path-list). Дефолт: `["packages/modules"]` (относительно корня workspace). Отсутствующий **дефолтный** рут → warning + пустой пул (boot ok); явно заданный рут не существует → **boot fail** `CONFIG_INVALID`. |
| D3 | Поле `rpengineext.module` **есть, но невалидно** (entry/factory пустые или не строки, id не kebab) → **boot fail** `CONFIG_INVALID` (пакет явно заявил намерение быть модулем — typos не молчат). Поле **отсутствует** → пакет не кандидат, skip + debug. |
| D4 | Импорт entry не найден / `factory` не экспортируется / `factory()` бросил → **boot fail** `CONFIG_INVALID` (moduleId + путь + hint). |
| D5 | Порядок: пул сортируется **глобально по id, лексикографически** (порядок рутов не сохраняется; стабильно на любой ОС/ФС). Мгновенная инстанциация в этом порядке = registration order → существующий tie-break равных priority (spec 04 §4.1.1) работает без изменений. Явные списки (`RP_MODULES` и т.п.) сохраняют семантику list order (уже реализовано). |
| D6 | Коллизия id: внутри пула discovery (два пакета, один id) → **boot fail** `MODULE_ID_DUPLICATE` (оба пути в details). Каталог vs discovery → **каталог побеждает**, discovered skip + warn (промоушн «discovery → first-party» не должен ломать boot). |
| D7 | `options.modules` задан → discovery **пропущен целиком** (exclusive, spec 04 без изменений); `extraModules` — как раньше, append. |
| D8 | Unknown id в `RP_MODULES`/`enabledModuleIds` → `MODULE_UNKNOWN` с hint по id пула (существующий код, пул расширяется). |
| D9 | Валидация инстанса (engines, IR, strict requires, дубли) — без изменений, тот же registry boot. |
| D10 | Discovery — только на boot. Hot-reload/watch — no (spec 04 out of scope). |
| D11 | Изменения только в `host-bootstrap` + `create-module` (эмитит поле в шаблон пакета) + доки. `module-sdk`/`contracts`/`core` не трогаются → совместимо с фризом 1.x; релиз = **host-bootstrap minor** (аддитивная опция, гейты зелёные). |

### Precedence (не меняется, спека 04 остаётся единственным источником)

```text
IF options.modules set:
  base = options.modules (discovery skipped)
ELSE:
  baseIds = resolve(profile / RP_MODULES / env)      # по пулу (catalog ⊕ discovery)
  baseIds += enabledModuleIds; baseIds −= disabled / RP_DISABLE_MODULES
  base = instantiate(baseIds)                        # ленивый импорт только выбранных
result = base ++ extraModules
```

## 3. Non-goals

- **Авто-включение всех модулей** по умолчанию (пул ≠ загрузка; бут остаётся контролируемым).
- Remote marketplace / скачивание плагинов / untrusted-код (домен безопасности — см. §6).
- Sandbox / изоляция исполнения модулей (требует отдельного workstream; здесь — доверенный локальный код).
- Hot-reload / fs-watch / динам-подписка на добавление пакетов в рантайме.
- Per-player module sets (spec 04 out of scope).
- Динамические профили из discovery (профили остаются статичными нормами spec 04).
- Сканирование вне явно настроенных рутов (никакого «найди все пакеты в node_modules»).

## 4. Considered alternatives (rejected)

| Альтернатива | Почему нет |
|--------------|------------|
| **Инструмент генерации** кода в `MODULE_CATALOG` (codegen по workspace) | По сути = сегодняшний каталог, но с пересборкой host-bootstrap на каждый модуль; env-адресация остаётся «компиляционной». |
| **import.meta.glob / bundler-glob** в точке входа | Привязка к сборщику; ломает bun/tsc портируемость; список всё равно фиксирован на этапе сборки. |
| **Сканирование манифестов + авто-включение всех** | Нарушает «boot = предсказуем»: N случайных пакетов в репе меняют поведение хоста без явного выбора; несовместимо с D1a. |
| **Discovery через index.ts роутов (конвенция файлов)** | Магические имена файлов — против принципа «explicit over implicit» (P2); package.json — уже существующая декларативная точка. |
| **Полный реестр одним JSON** (`packages/modules/registry.json`) | Работоспособно, но требует поддержки в каждой среде (порядок, дубли) и create-module обязан его вести; декларация в самом пакете самодостаточна и следует за пакетом. |

## 5. Implementation sketch

### 5.1 New files

```text
packages/host-bootstrap/src/module-discovery.ts   # scan → pool entries (lazy factories) + validation
packages/host-bootstrap/tests/module-discovery.test.ts
packages/host-bootstrap/tests/fixtures/module-dirs/…  # tmp-каталоги, генерируются в тесте
```

`ModulePoolEntry`:

```ts
interface ModulePoolEntry {
  readonly id: string;
  readonly source: string;                    // путь package.json (для details)
  readonly factory: () => Module | Promise<Module>;
  readonly description?: string;              // hint для MODULE_UNKNOWN
}
```

Интерфейс: `discoverModulePool(roots: readonly string[], opts: { strict?: boolean; log: TurnLogger }): Promise<Result<ModulePoolEntry[], Failure>>` —
один проход: readdir → filter по наличию `package.json` → parse+validate поля →
сортировка D5 → entries. Инстанциация — вне discovery (лениво, при отборе).

### 5.2 Touchpoints

| Файл | Изменение |
|------|-----------|
| `create-host-runtime.ts` | опции `moduleDirs?`; `resolveHostModules` принимает пул; D2/D6/D7 |
| `module-catalog.ts` | merge-хеlper: `resolvePool(catalog, discovered)` (D6) |
| `env.ts` | `RP_MODULE_DIRS` parse (path-list, как `RP_MODULES`) |
| `packages/create-module/src/main.ts` | генерирует `rpengineext.module` в package.json шаблона |
| `docs/architecture/08-configuration.md` | `RP_MODULE_DIRS`, правила discovery, security note |
| `README.md` host-bootstrap + `docs/modules/README.md` | «wire = положить пакет + env» |

### 5.3 Tests (host-bootstrap)

1. пул из fixture-рута: id-порядок, ленивость импорта (невыбранный модуль не импортируется);
2. env-селекция по discovered id: `RP_MODULES=mood` загружает; `RP_DISABLE_MODULES` выключает;
3. unknown id → `MODULE_UNKNOWN` с hint (id из пула);
4. дубль id внутри discovery → `MODULE_ID_DUPLICATE` (оба пути в details);
5. каталог vs discovery → каталог побеждает (warn, boot ok);
6. невалидное поле / отсутствующий entry / отсутствующий factory → `CONFIG_INVALID`;
7. `options.modules` → discovery пропущен; `extraModules` append после пула;
8. отсутствующий дефолтный рут → warn + пустой пул; явный несуществующий рут → fail;
9. порядок инстанциации детерминирован на двух прогонах.

### 5.4 Гейты

`test:compat` / `test:modules-stress` / `test:platform` не затрагиваются (sdk/core не меняются);
`test:host-bootstrap` + `typecheck` обязательны; scaffold-smoke остаётся зелёным (create-module шаблон
получает поле, smoke проверяет генерацию).

## 6. Security model (явно)

- Discovery импортирует **только доверенный локальный код**: каталоги, настроенные оператором
  (`moduleDirs` / `RP_MODULE_DIRS`), пакеты из репозитория/установки.
- `RP_MODULE_DIRS` — операторская конфигурация (как `RP_LLM_API_KEY`), **не** пользовательский ввод;
  валидируется пути (без wildcard-импорта, только прямые подкаталоги рута).
- **Нет** remote-fetch, **нет** sandbox-обещания: модель доверия = git repo + `bun install`
  (та же, что у `extraModules` сегодня). Sandbox/marketplace не входят в 1.x
  (spec 00 anti-scope).
- Discovery не создаёт канал module→module зависимостей: boundary CI
  (`test:module-boundaries`) продолжает действовать на package.json независимо от способа подключения.

## 7. Consequences

### Positive

- Единый путь для всех модулей: **положил пакет + выбрал env** — 0 строк кода у хоста.
- Исчезает разрыв «first-party vs остальные»: пул адресуется id одинаково.
- Никаких правок `host-bootstrap` на новый модуль; каталог остаётся только для «благословлённых» first-party.
- Ленивый импорт: boot не платит за невыбранные модули.
- Полиглот-готовность не затронута: discovery импортирует фабрику, а контракт остаётся `Module`/IR.

### Costs / risks

- Новый скан на boot (readdir + parse нескольких package.json) — тривиален, но это I/O:
  ограничен рутами, не рекурсивен по node_modules.
- Две точки декларации в package.json (поле + `name`-дефолт) — риск раставания; лечится D3-валидацией
  и create-module (эмитит поле автоматически).
- Оператор деплоя обязан явно задать `RP_MODULE_DIRS`, если модули лежат не в стандартном руте —
  документируется в 08-configuration.

### Compatibility

- Модули, подключённые через `extraModules` / `modules` / каталог, продолжают работать без изменений.
- Ничего нового не требуется от авторов модулей (поле — это «нулевой шаг», не обязательный
  для существующих путей).
- Релиз: **host-bootstrap minor** (1.x); `module-sdk`/`contracts`/`core` не трогаются —
  фриз spec 01/07 не нарушается.

## 8. Relationship to other ADRs

| ADR | Relation |
|-----|----------|
| 0004 Module SDK | Discovery импортирует фабрики `defineModule`-модулей; install-путь (`compiled.install`) не меняется. |
| 0005 Moments-native | Независим: host-level фича; core-ривайт не затрагивается (и наоборот). |
| 0001 CPA | Не затрагивает pipeline/commit; только источник `Module[]` на boot. |

## 9. Checklist (Implemented)

- [x] `discoverModulePool` + merge-пул (D5/D6) + ленивая инстанциация
- [x] `RP_MODULE_DIRS` + `moduleDirs` + валидации D2–D4
- [x] Тесты §5.3, `test:host-bootstrap` + `typecheck` зелёные
- [x] create-module эмитит `rpengineext.module`
- [x] Доки: 08-configuration, host-bootstrap README, modules README
- [x] Гейты 1.x зелёные (compat/stress/platform/scaffold/boundaries)
- [x] Этот ADR → Accepted → Implemented + дата; ADR-таблицы в root README и 00-overview обновлены

## 10. References

- Host composition (норматив): [specs/04](../specs/04-host-composition.md)
- Каталог сегодня: `packages/host-bootstrap/src/module-catalog.ts`
- Compose: `packages/host-bootstrap/src/create-host-runtime.ts` (`resolveHostModules`)
- Env: `packages/host-bootstrap/src/env.ts`
- Scaffold: `packages/create-module/src/templates.ts`
- Anti-scope marketplace: [specs/00 §5](../specs/00-overview-and-release-gate.md)