# Narrative prompt profiles (ADR 0007)

Версионированные JSON-паки промпта `narrative.write`, живущие **вне core**.

Правка промпта = правка JSON-файла + перезапуск движка. Никаких релизов core.

## Как это работает

- Движок на boot сканирует эту директорию (`RP_PROMPTS_DIR`, дефолт `data/prompts`)
  и собирает registry: built-in `default@1.0.0` + все `*.json` из **верхнего уровня** (подпапки не сканируются).
- Файл обязан называться `{id}@{version}.json` и совпадать с полями `id` / `version` внутри.
- Выбор профиля — per session (на старте движка):
  1. `RP_NARRATIVE_PROMPT_PROFILE` (env, quick override для экспериментов);
  2. маппинг `agents.promptProfiles` в конфиге (model alias → `id@version`);
  3. `agents.defaultPromptProfile` (дефолт: `default@1.0.0`).
- Идентификатор выбранного профиля (`id@version`) пишется в audit (`rawMeta.promptProfile`),
  structured logs и turn `.md` trace — по этой паре (model, promptProfile) внешний evaluator
  сравнивает вариации.

## Формат профиля

```jsonc
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
    "title": "Предыдущий ответ отклонён.",
    "instructions": ["Исправь ответ и верни ТОЛЬКО валидный JSON…",
                     "Причины отклонения: {{issues}}"],
    "hintsTitle": "Дополнительные подсказки:"
  },
  "constraints": {                              // optional
    "temperature": 0.7,
    "maxRepairAttempts": 1
  }
}
```

## Плейсхолдеры (закрытый словарь)

| Плейсхолдер | Где разрешён | Значение |
|-------------|--------------|----------|
| `{{locale}}` | systemCore, rulesReminder | BCP-47 locale текущего хода |
| `{{lengthGuidance}}` | systemCore, rulesReminder | ориентир длины из NARRATIVE STYLE.length |
| `{{playerActionLabel}}` | systemCore, rulesReminder | метка действия игрока (labels.playerAction) |
| `{{issues}}` | repair.instructions | ошибки schema-валидации |
| `{{hints}}` | repair.instructions | доп. подсказки ремонта (join через `\n`) |

Любой другой `{{…}}` → `CONFIG_INVALID` на boot. JSON — данные, не код: никакого eval.

## Правила валидации (boot)

- имя файла = `{id}@{version}.json`; version — semver;
- дубль `id@version` (в т.ч. с built-in `default@1.0.0`) → `CONFIG_INVALID`;
- неизвестный плейсхолдер / не в своём поле → `CONFIG_INVALID`;
- явно заданная `RP_PROMPTS_DIR` не существует → `CONFIG_INVALID`; дефолтная отсутствует → warning + built-in;
- неизвестный `id@version` в конфиге/env → `CONFIG_INVALID` (никакого тихого подхвата).

## Примеры

- `examples/narrative@0.0.0-example.json` — рабочий минимальный профиль (tracked в git).
- `examples/default@1.0.0.json` — **эталон**: точная копия built-in промпта до правок (1:1).
  Подпапка `examples/` не сканируется, поэтому эталон не конфликтует с built-in.
- Приватные профили клади в корень `data/prompts/` — они gitignored, как приватные истории.

### Как начать вариацию с эталона (default)

По правилам валидации файл `default@1.0.0.json` в корне даст дубль с built-in → `CONFIG_INVALID`.
Поэтому первая правка = **смена версии**:

```bash
cp data/prompts/examples/default@1.0.0.json data/prompts/default@1.1.0.json
# правь default@1.1.0.json (текст, repair, constraints, description)
# в файле: "version": "1.1.0"
# выбор:
RP_NARRATIVE_PROMPT_PROFILE=default@1.1.0 <запуск движка>
```

Либо заведи собственный id (например `narrative@2.0.0.json`) и выбирай его —
такие файлы не конфликтуют ни с чем.

## Связанные доки

- [ADR 0007](../../docs/adr/0007-narrative-prompt-profiles.md)
- [05-agents.md](../../docs/architecture/05-agents.md) · [08-configuration.md](../../docs/architecture/08-configuration.md)
