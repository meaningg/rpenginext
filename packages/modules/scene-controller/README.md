# `@rpengineext/module-scene-controller`

**Scene Controller** — жёсткий контроль темпа сцены через LLM-зонд.

Модуль не имеет контентных эвристик: единственный источник истины о сцене —
фоновый LLM-зонд, который после **каждого** player-хода оценивает состояние
сцены и возвращает вердикт. Модуль только хранит вердикты, агрегирует их и
транслирует в три рычага: эскалация narrative-инструкций, guard-стоп повторов,
статус для UI.

## Проблема, которую решает

Модель не понимает, когда сцена затягивается: бесконечные погони («находят
снова и снова»), бесконечные бои («очередная волна врагов»). Зонд каждый ход
судит, повторяются ли биты/исходы (`stall`, `repeat`, `loop`), выставляет
`urgency 0..3` и подсказку развязки `resolutionHint`. На `urgency 2/3`
narrative-секция требует развязки в ближайшие ходы; на `loop: "hard"` + буквальном
повторе действия игрок получает отказ (`SCENE_REPEAT_CAP`).

**Нейтральность:** типы сцен широкие и равноправные (12 значений без выделения
chase/combat), подсказки развязки — контекстные от зонда, шаблоны-фолбэки
нейтральны (никаких «противник сдаётся»). Модуль не подталкивает сюжет к
конфликтам.

**Детерминированный прогресс-клок:** `urgency/loop/stall` от модели шумные и
немонотонные (модель может один раз дать 3 и на следующий ход снова 0), поэтому
эскалация дополнительно опирается на `highProgressBeats` — счётчик подряд идущих
зондов, где модель сама судит `progress >= saturatedProgress` без `resolved`.
Пол `max(urgency модели, пол клока)` не даёт сцене бесконечно висеть на
«0.9+, а финала нет». Счётчик переносится через смену сцены (фейковый
`sameScene:false` с насыщенным прогрессом не обнуляет его) и сбрасывается
только на реальный `resolved` или честное падение прогресса.

## Public contract

- **id** — `scene-controller` · **version** — `1.0.0` · **priority** — `30`
- **provides** — нет · **requires** — `capability:working-memory` (контекст пар берётся из readModel `working_memory.window` — собственного буфера пар у модуля нет)

### Slice

- Имя: `scene_controller` · schemaVersion: `1`
- `current` — активная сцена (id, label, type, beat, прогресс) или `null`
- `loopLevel` — монотонный max severity зацикливания в рамках сцены
  (`none | soft | hard`)
- `consecutiveStalls` — подряд stall-вердиктов
- `highProgressBeats` — прогресс-клок: подряд зондов с `progress >= saturatedProgress` без `resolved`
- `lastVerdict` — последний вердикт зонда
- `lastTurnId` — id последнего player-хода (книговедение; подпитывает `observedTurnId`)
- `history` — закрытые сцены (outcome: `resolved | transitioned`)
- `counters` — playerTurns / probes / resolvedScenes / scenes (последовательные id)

### Meta keys (seed)

Нет — модуль ничего не сеет.

### Config (`moduleConfig.scene_controller`)

| Ключ | Дефолт | Смысл |
|---|---|---|
| `historyCap` | `10` | записей в логе закрытых сцен |
| `probeEnabled` | `true` | выкл = модуль инертен (только книговедение) |
| `hardStopEnabled` | `true` | guard-стоп повторов |
| `saturatedProgress` | `0.85` | порог прогресс-клока: `progress >=` = «сцена почти завершена» |
| `climaxSaturatedBeats` | `3` | насыщенных зондов подряд → пол эскалации `climax` (2) |
| `hardSaturatedBeats` | `6` | насыщенных зондов подряд → пол эскалации `hard` (3) |
| `resolutionHints` | `{}` | per-type нейтральные шаблоны (фолбэк) |

### AI

- System reason: `scene_controller.probe` (after каждого player-хода, background)
- Task: `probe` (`optional: true`, timeout 20s, temp 0.2); контекст — последние пары из `working_memory.window` readModel; **в инпут модели не попадает ни один turn id**
- Tool: `report_scene` (args = вердикт; `observedTurnId` и `historyCap` подставляет хендлер из slice/конфига — модель ничего не эхоирует)

### Ops

- `record_turn` — счётчик player-ходов (единственный детерминированный write)
- `probe_report` — все изменения сцены по вердикту зонда

### Narrative

- Секция `scene_controller.control` (system, priority 10) — эскалация:
  `develop` → `climax` (заверши в 1–2 хода) → `hard` (развязка обязательна в этом ходе).
  Режим и `urgency` считаются как `max(вердикт модели, пол прогресс-клока)`.
- Brief: `{ scene, tempo: { mode, urgency, loopLevel, highProgressBeats }, resolutionHint }`

### Guard

- `SCENE_REPEAT_CAP` — только при `loopLevel === "hard"` И буквальном совпадении
  текста действия с предыдущим (после trim). Семантику повтора судит LLM.

### Events

Нет (v1).

### Read-models

- `scene_controller.status` — `{ present, scene, tempo, counters }`
- `scene_controller.history` — `{ history, resolvedScenes }`

## Запуск и тесты

```bash
bun test packages/modules/scene-controller
bunx tsc --noEmit -p packages/modules/scene-controller/tsconfig.json
bun run test:module-boundaries
```

Подключение через discovery (ADR 0006):

```bash
RP_MODULES=scene-controller bun run cli --modules
```