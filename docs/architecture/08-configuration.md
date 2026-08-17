# Configuration

> **Статус:** normative  
> **Правило:** никаких magic URLs, keys, timeouts в коде.

## 1. Layers

1. defaults (code constants with safe values only where harmless)
2. config file (`rpengine.config.json` / `.toml` — выбор host)
3. environment variables (secrets & overrides)
4. CLI flags (highest for local runs)

Merge: deterministic deep merge with explicit precedence.

## 2. Env secrets

| Variable | Purpose |
|----------|---------|
| `RP_LLM_API_KEY` | provider key |
| `RP_LLM_BASE_URL` | optional base URL |
| `RP_DATA_DIR` | saves directory |
| `RP_LOG_LEVEL` | debug/info/warn/error |

Names finalise at implementation; document in root README.

**Ban:** keys in module repos, snapshots, git.

## 3. Config object (logical)

```text
EngineConfig {
  modules: {
    enabled: string[]            // module ids
    paths?: string[]             // discover paths
    strictManifest: boolean
  }
  turn: {
    // atomicity is always full-turn rollback; no mode switch in v1
    stageTimeoutsMs: Record<stage, number>
    sessionBusyPolicy: "queue" | "error"
  }
  agents: {
    provider: string
    defaultModel: string
    maxParallelPerTurn: number
    maxTokensPerTurn: number
    maxRepairAttempts: number
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

- Only modules in `modules.enabled` (if list non-empty) load.
- Else discover all from paths (dev mode).
- Production host should use explicit allowlist.

## 5. Feature flags

Feature flags belong in config, not scattered booleans in core code paths without naming.

Naming: `features.<area>.<name>`.

## 6. Validation

Boot fails if:

- config schema invalid;
- secret missing while provider enabled;
- enabled module not found;
- capability graph unsatisfied under production profile.
