# Configuration

> **Статус:** normative  
> **Правило:** никаких magic URLs, keys, timeouts в коде.

## 1. Layers

1. defaults (code constants with safe values only where harmless)
2. environment variables (secrets & overrides) — primary for hosts v1
3. CLI flags (e.g. `--mock`, `--session`) — highest for local runs
4. optional config file (`rpengine.config.json` / `.toml`) — reserved; not required for v1 hosts

Merge: deterministic; CLI / forced options override env.

## 2. Host environment (`@rpengineext/host-bootstrap`)

Names from `HOST_ENV` / related readers:

| Variable | Purpose | Notes |
|----------|---------|--------|
| `RP_LLM_API_KEY` | provider key | required for live LLM mode |
| `RP_LLM_BASE_URL` | API base URL | required for live LLM mode |
| `RP_LLM_MODEL` | default model id | required for live LLM mode |
| `RP_LLM_TIMEOUT_MS` | LLM HTTP timeout | optional |
| `RP_DATA_DIR` | engine data root | default `data` (sqlite + traces) |
| `RP_SQLITE_PATH` | engine DB file | optional override |
| `RP_HOST_SQLITE_PATH` | API identity DB | optional; default under data dir |
| `RP_STORIES_DIR` | story JSON directory | default `data/stories` |
| `RP_LOG_LEVEL` | `debug` / `info` / `warn` / `error` | default `info` |
| `RP_LOG_JSON` | `1` = JSON logs | default pretty |
| `RP_WORKING_MEMORY_WINDOW` | last-N chat pairs | positive int; default `12` |
| `RP_MODULE_PROFILE` | first-party module profile | `core-book` (default) \| `minimal` \| `none` — **Platform 1.0** ([specs/04](../specs/04-host-composition.md)); модули подключаются profiles / env / options (`RP_MODULE_PROFILE`, `RP_MODULES`, `RP_DISABLE_MODULES`) — никакого hardcode |
| `RP_MODULES` | comma module ids | replaces profile first-party set (list order) |
| `RP_DISABLE_MODULES` | comma module ids | remove from resolved set after profile/list |
| `RP_AGENTS_STREAMING` | `0` disables draft stream | default on |
| `RP_AGENTS_MODE` | explicit agents mode | `mock` \| `llm`; wins over credentials-based resolution (default: `llm` if API key present, else `mock`) |
| `RP_HTTP_HOST` | API bind host | default `127.0.0.1` |
| `RP_HTTP_PORT` | API bind port | default `8787`; `0` = ephemeral (tests) |
| `RP_CORS_ORIGIN` | CORS allow origin | default `http://127.0.0.1:5173` |
| `RP_PLAYER_TOKEN_SECRET` | HMAC/secret for local tokens | **dev default only** — change outside localhost |
| `RP_MAX_SESSIONS_PER_PLAYER` | host limit | default `32` |
| `RP_MAX_CONCURRENT_TURNS` | host limit | default `8` |

**Ban:** keys in module packages, snapshots, git, traces without redaction.

Agents mode: live if LLM credentials present; otherwise mock. CLI/API `--mock` forces mock.

## 3. EngineConfig object (logical)

```text
EngineConfig {
  modules: {
    strictManifest: boolean
    failOnMissingCapability: boolean  // production default true
    // enablement решается host-level (профили / RP_MODULES / extraModules) — не в EngineConfig
  }
  moduleConfig: {
    [moduleId]: object           // validated by registerConfigSchema
  }
  turn: {
    // atomicity is always full-turn rollback; no mode switch in v1
    stageTimeoutsMs: Record<stage, number>
    sessionBusyPolicy: "error"
  }
  agents: {
    mode: "mock" | "llm"
    defaultModel: string
    defaultTimeoutMs: number
    maxParallelPerTurn: number
    maxRepairAttempts: number
    enableActionInterpret: boolean
    streaming: boolean
    maxToolRounds: number
    temperature?: number
    // required agent/narrative failure always fails the whole turn
  }
  persistence: {
    policy: "per_turn" | "manual"
    // driver (bun:sqlite = v1) и пути к БД — host-level (host-bootstrap), не в EngineConfig
  }
  logging: {
    level: string
    json: boolean
  }
  tracing: {
    enabled: boolean                 // dev default true
    directory: string                // e.g. data/traces
    includePrompts: boolean
    includeRawModelOutput: boolean
    includeFullStateSnapshots: boolean
    maxStringFieldChars: number
    maxArrayItems: number
    redactKeys: string[]
    writeOnReject: boolean           // default true
    writeOnCommit: boolean           // default true
    failTurnOnWriteError: boolean    // default false
  }
}
```

## 4. Module enablement

**Normative (Module Platform 1.0 done)** — [specs/04-host-composition.md](../specs/04-host-composition.md).

| Mechanism | Role |
|-----------|------|
| `moduleProfile` / `RP_MODULE_PROFILE` | first-party set: `core-book` (default), `minimal`, `none` |
| `RP_MODULES` / enable lists | replace or extend ids from host catalog **+ discovery pool** |
| `RP_DISABLE_MODULES` / `disabledModuleIds` | remove ids after resolution |
| `extraModules` | append prebuilt `Module` instances (external/tests), **always last** |
| `modules` option | **exclusive** full override (then `extraModules` only; discovery skipped) |

### 4.0 Local module discovery (ADR 0006)

Модули в репозитории можно подключать **без единой строки кода** у хоста: пакет
декларирует себя в `package.json`, host сканирует руты и строит **id-пул**
(каталог first-party ⊕ discovery; каталог побеждает при коллизии id).
Выбор остаётся явным — discovery **не загружает** модули автоматически:

```jsonc
// packages/modules/mood/package.json
"rpengineext": { "module": { "id": "mood", "entry": "./src/index.ts", "factory": "createMoodModule" } }
```

| Knob | Meaning |
|------|---------|
| `RP_MODULE_DIRS` | comma list of scan roots; default `packages/modules` (workspace root); explicit roots must exist (`CONFIG_INVALID` otherwise) |
| `moduleDirs` option | same, code-level |

Rules (ADR 0006):

- Пакет без поля `rpengineext.module` — не кандидат (skip + debug);
- Поле есть, но невалидно / битый entry / нет фабрики → boot fail `CONFIG_INVALID`;
- Дубль id внутри discovery → `MODULE_ID_DUPLICATE` (оба пакета в details);
- Порядок: merged-пул сортируется **глобально** по id (лексикографически) по всем рутам (детерминизм, ADR 0006 D5);
- Импорт только **выбранных** модулей (лениво; невыбранные не импортируются);
- `options.modules` → discovery пропущен целиком;
- Security: только доверенные локальные руты (операторская конфигурация, не пользовательский ввод);
  без remote-загрузки и sandbox — модель доверия = git repo + install (ADR 0006 §6).

Rules:

- Precedence (locked): `options.modules` (exclusive) > `RP_MODULES` > profile (`options.moduleProfile` ?? `RP_MODULE_PROFILE` ?? `core-book`); затем `enabledModuleIds` add, `disabledModuleIds` + `RP_DISABLE_MODULES` remove.
- Unknown catalog id → boot fail `MODULE_UNKNOWN` (E12).
- `enabled ∩ disabled` non-empty → boot fail `CONFIG_INVALID` (no guess).
- Default production: **strict missing capability = ON** (`failOnMissingCapability`).
- Equal `priority` tie-break = **registration order** (resolved `base ++ extraModules`), детерминировано.
- Inventory: `listModules()` на runtime, CLI `--modules`, API `GET /modules`, structured boot log.

### 4.1 Module config & secrets (normative, spec 04 §4.6)

| Rule | Value |
|------|-------|
| `moduleConfig` — не secrets channel | значения могут попасть в конфиг-дампы/логи/error-контекст — api keys и токены запрещены |
| Secrets | process env, читается кодом модуля напрямую; host не проксирует env в модули в 1.0 |
| Failures | значения конфига/секретов не появляются в failure details (spec 03 §4.1) |
| Validation | moduleConfig zod schema на boot; fail → `CONFIG_INVALID` (E07) |

## 5. Feature flags

Feature flags belong in config, not scattered booleans in core code paths without naming.

Naming: `features.<area>.<name>`.

## 6. Validation

Boot fails if:

- config schema invalid;
- secret missing while live LLM mode enabled;
- enabled module not found / manifest invalid under `strictManifest`;
- capability graph unsatisfied under production profile;
- stories directory missing or invalid example templates fail parse.
