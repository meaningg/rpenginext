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
| `RP_AGENTS_STREAMING` | `0` disables draft stream | default on |
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
    enabled: string[]            // module ids
    paths?: string[]             // discover paths
    strictManifest: boolean
  }
  moduleConfig: {
    [moduleId]: object           // validated by registerConfigSchema
  }
  turn: {
    // atomicity is always full-turn rollback; no mode switch in v1
    stageTimeoutsMs: Record<stage, number>
    sessionBusyPolicy: "queue" | "error"
  }
  agents: {
    mode: "mock" | "llm"
    defaultModel: string
    defaultTimeoutMs: number
    maxParallelPerTurn: number
    maxTokensPerTurn: number
    maxRepairAttempts: number
    enableActionInterpret?: boolean
    streaming?: boolean
    taskModels?: Record<taskType, string>
    // required agent/narrative failure always fails the whole turn
  }
  persistence: {
    driver: "bun:sqlite"          // v1 only
    policy: "per_turn" | "manual"
    dataDir: string               // directory for .sqlite file(s)
    databaseFile?: string         // optional explicit path
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
  safety?: {
    rating: string
    moderateInput: boolean
    moderateOutput: boolean
  }
}
```

## 4. Module enablement

- Host wires modules explicitly in `createHostRuntime` (defaults + `extraModules`).
- `modules.enabled` / discover paths remain available for future dynamic load.
- Production host should use an explicit module list (no silent auto-discovery of untrusted code).

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
