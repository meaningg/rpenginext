/**
 * Russian UI copy. Keep user-facing strings out of components.
 */
export const COPY = {
  app: {
    name: "RP Engine",
    tagline: "Интерактивные истории",
  },
  nav: {
    stories: "Истории",
    sessions: "Сессии",
  },
  stories: {
    kicker: "Библиотека",
    title: "Выберите историю",
    subtitle:
      "Свободный текст, спокойное чтение. Один ход — одна сцена рассказчика.",
    cta: "Открыть",
    start: "Начать историю",
    loading: "Загружаем истории…",
    empty: "Истории пока не найдены.",
    back: "К каталогу",
    sessionTitle: "Название сессии",
    sessionTitleHint: "Необязательно. Можно переименовать позже.",
    sessionTitlePlaceholder: "Например: Ночной дозор",
    starting: "Создаём сессию…",
  },
  sessions: {
    kicker: "Продолжить",
    title: "Мои сессии",
    subtitle: "Сохранённые прохождения на этом устройстве.",
    emptyTitle: "Пока нет сессий",
    emptyBody: "Начните историю — она появится здесь.",
    emptyCta: "К историям",
    continue: "Продолжить",
    rename: "Переименовать",
    delete: "Удалить",
    deleteConfirm: "Удалить эту сессию? Действие нельзя отменить.",
    renaming: "Сохраняем…",
    deleting: "Удаляем…",
    updated: "обновлено",
    loading: "Загружаем сессии…",
  },
  play: {
    back: "Сессии",
    you: "Вы",
    narrator: "Рассказчик",
    dialogue: "Диалог",
    dialogueSearch: "Поиск по диалогу…",
    dialogueEmpty: "Реплик пока нет.",
    dialogueCount: (n: number) => `${n}`,
    save: "Сохранить",
    saving: "Сохранение…",
    saved: "Сохранено",
    placeholder: "Что вы делаете?",
    send: "Отправить",
    composerHint: "Enter — отправить · Shift+Enter — новая строка",
    loading: "Загружаем историю…",
    emptyTitle: "Страница пуста",
    emptyBody: "Напишите действие ниже, чтобы начать сцену.",
    writing: "пишет…",
    jumpTo: "К реплике в тексте",
    closeDialogue: "Скрыть диалог",
    openDialogue: "Показать диалог",
  },
  common: {
    error: "Что-то пошло не так",
    retry: "Повторить",
    cancel: "Отмена",
    confirm: "Подтвердить",
    close: "Закрыть",
    loading: "Загрузка…",
    save: "Сохранить",
  },
  stages: {
    sending: "Отправляем действие…",
    thinking: "Думаем…",
    normalize: "Читаем действие…",
    intent: "Разбираем намерение…",
    guard: "Проверяем правила…",
    plan: "Планируем сцену…",
    propose: "Обновляем мир…",
    validate: "Сверяем состояние…",
    narrate: "Пишем сцену…",
    present: "Собираем страницу…",
    commit: "Сохраняем ход…",
    writing: "Пишем…",
  },
} as const;

/**
 * Maps pipeline stage ids to human-readable Russian labels.
 */
export function stageLabel(stage?: string, phase?: string): string | null {
  if (!stage || phase === "finished") return null;
  const map: Record<string, string> = {
    normalize: COPY.stages.normalize,
    intent: COPY.stages.intent,
    guard: COPY.stages.guard,
    plan: COPY.stages.plan,
    propose: COPY.stages.propose,
    validate: COPY.stages.validate,
    narrate: COPY.stages.narrate,
    present: COPY.stages.present,
    commit: COPY.stages.commit,
  };
  return map[stage] ?? stage;
}
