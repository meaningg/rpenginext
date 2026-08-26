# Author-facing Errors (normative catalog E01–E26)

> Module Platform 1.0 · стабильные коды для **всех** author-facing paths:
> boot / turn / events / lifecycle / readModel.  
> Single source кодов: `packages/contracts/src/errors.ts`
> (`MODULE_FAILURE_CODES`). Связанное: [compatibility.md](./compatibility.md) ·
> [specs/03](../specs/03-author-errors.md).

## Shape (MUST для author-facing failures)

| Поле | Требование |
|------|------------|
| `code` | **MUST** — стабильный токен из каталога |
| `message` | **MUST** — что сломалось + Hint |
| `details.moduleId` | **MUST**, когда известен один модуль |
| `details.moduleIds` | **MUST**, когда их несколько (duplicate и т.п.) |
| `details.slice` / `op` / `capability` / `configKey` / `taskType` / `toolId` | **MUST** когда применимо |
| `causedBy` | optional nested |
| secrets | **MUST NOT** (api keys, raw LLM dumps и т.п.) |

Message pattern:

```text
[<code>] <what failed> (module: <id>). Hint: <what to do>.
```

Host/API всегда возвращает структурированный `Failure` — не сырые exception'ы.

## Каталог (E01–E26)

| # | Code | Когда | Fix hint |
|---|------|-------|----------|
| E01 | `MODULE_DEFINE_INVALID` | defineModule/normalize invalid (id/version/имя события/…) | проверь id (kebab-case), version (semver), pattern имён |
| E02 | `MODULE_OP_UNKNOWN` | `ctx.op` на неизвестное имя | message содержит известные ops; проверь `state.ops` |
| E03 | `MODULE_IR_BIND_MISMATCH` | IR/binding структурное несоответствие | пересобери модуль той же версией sdk |
| E04 | `MODULE_ID_DUPLICATE` | duplicate module id | message называет оба id; смени один |
| E05 | `MODULE_SLICE_DUPLICATE` | duplicate slice name | message называет slice + оба модуля; смени slice name |
| E06 | `MODULE_REQUIRES_MISSING` | неудовлетворённый `requires` | message называет capability token; загрузи модуль-провайдера или убери requires |
| E07 | `CONFIG_INVALID` | moduleConfig schema fail | message называет config key + zod summary |
| E08 | `MODULE_PERMISSION_DENIED` | propose/agent без permission | проверь permissions модуля на slice/op |
| E09 | `SCHEMA_INVALID` | seed meta parse fail | message называет `fromMeta` key; поправь story JSON |
| E10 | `MODULE_READ_MODEL_UNKNOWN` | unknown readModel name (все моменты) | message называет name + moduleId; каталог — в public contract README провайдера |
| E11 | `MODULE_ENGINES_INCOMPATIBLE` | engines.core/contracts вне диапазона | message: required vs actual; обнови sdk или движок |
| E12 | `MODULE_UNKNOWN` | host catalog unknown id | message: id + known ids hint (truncated); проверь profile/RP_MODULES |
| E13 | `MODULE_OP_PAYLOAD_INVALID` | op payload schema fail | message: moduleId, op, zod path |
| E14 | `MODULE_SLICE_UNMIGRATABLE` | unmigratable slice version на load | message: moduleId, slice, fromVersion; добавь `state.migrations[from]` или обнови save |
| E15 | `MODULE_MOMENT_OP_FORBIDDEN` | `ctx.op` / mutate в write-forbidden моменте (`committed`, `narrative.*`, `event.dispatch`, …) | message: moduleId + moment name; вынеси запись в `turn.change` / `afterProse` / tool `proposeOp` |
| E16 | `MODULE_EVENT_DUPLICATE` | duplicate publisher одного canonical event name | message: оба moduleId; один publisher на имя |
| E17 | `MODULE_EVENT_UNKNOWN` | emit/subscription на неизвестное имя | message: moduleId, event name, known events hint (truncated); проверь типо |
| E18 | `MODULE_EVENT_PAYLOAD_INVALID` | emit payload не прошёл publisher schema | message: moduleId, event, zod path |
| E19 | `MODULE_EVENT_EMIT_FORBIDDEN` | `ctx.emit` в неразрешённом моменте | message: moduleId, moment name; emit только в `committed` / `rejected` / `event.dispatch` |
| E20 | `MODULE_EVENT_DENY_FORBIDDEN` | `deny()` внутри event dispatch | message: moduleId, event name; хендлеры observe-only — follow-up через `scheduleSystem` |
| E21 | `MODULE_EVENT_HANDLER_ERROR` | subscriber handler throw (post-commit) | warning; turn остаётся committed; мир не меняется |
| E22 | `MODULE_EVENT_CASCADE_LIMIT` | cascade depth cap `MODULE_EVENT_MAX_CASCADE_DEPTH = 8` | warning; dispatch прерван; рекурсивные emit — выноси в `scheduleSystem` |
| E23 | `MODULE_EVENT_BURST_LIMIT` | per-turn burst cap `MODULE_EVENT_MAX_BURST_PER_TURN = 256` | warning; остальные события dropped |
| E24 | `MODULE_INIT_FAILED` | `init` hook failed | **boot fail**; message: moduleId + hint без секретов; init не должен трогать мир |
| E25 | `MODULE_SHUTDOWN_ERROR` | `shutdown` hook error | warning; stop не валится |
| E26 | `MODULE_READ_MODEL_ARGS_INVALID` | readModel args не прошли провайдер-схему | message: caller moduleId, model name, zod path |

## Legacy mapping (0.x → 1.0)

| Legacy code | 1.0 код |
|-------------|---------|
| `DUPLICATE_MODULE` | `MODULE_ID_DUPLICATE` (E04) |
| `CAPABILITY_MISSING` | `MODULE_REQUIRES_MISSING` (E06) |
| `ENGINE_MISMATCH` | `MODULE_ENGINES_INCOMPATIBLE` (E11) |
| `MANIFEST_INVALID` | `MODULE_DEFINE_INVALID` (E01) / `MODULE_IR_BIND_MISMATCH` (E03) |
| `REGISTRATION_INVALID` | сохраняется для raw register (non-author path) |

Legacy-коды остаются в type union `BOOT_FAILURE_CODES` для совместимости
потребителей; новые paths эмитят только нормативные `MODULE_*` коды.

## Ключевые нормативные правила

- **E15 никогда тихо:** write-forbidden момент (особенно `turn.committed`)
  обязан fail loud на `ctx.op` / `proposeOp`. Silent collect-and-drop **запрещён**.
- **E10 никогда `undefined`:** unknown `ctx.readModel` — fail loud во всех
  моментах, включая `narrative.*`.
- **E21/E25 — warnings, не fail:** post-outcome/cleanup ошибки логируются
  структурированно, никогда silent.
- Значения moduleConfig и secrets **никогда** не попадают в failure details
  (spec 04 §4.6).