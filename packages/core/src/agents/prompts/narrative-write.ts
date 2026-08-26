import type {
  AgentTask,
  JsonObject,
  LlmMessage,
  NarrativePromptSection,
} from "@rpengineext/contracts";

import { DEFAULT_TURN_LOCALE } from "../../util/locale.ts";

/** Метка текущего действия игрока в user-сообщении narrative.write. */
export const PLAYER_ACTION_LABEL = "Действие игрока:";

/**
 * Builds chat messages for `narrative.write` LLM calls.
 *
 * Prompt body is assembled from compiled {@link NarrativePromptSection}s
 * (modules + core). Structured `brief` stays on the task for critics/traces
 * and is NOT dumped into the user message.
 *
 * @param task - agent task (input: brief/style/locale/history/promptSections)
 */
export function buildNarrativeWriteMessages(task: AgentTask): LlmMessage[] {
  const input = task.input;
  const brief = (input.brief ?? {}) as JsonObject;
  const style = (input.style ?? {}) as JsonObject;
  const locale =
    typeof input.locale === "string" && input.locale.trim().length > 0
      ? input.locale.trim()
      : DEFAULT_TURN_LOCALE;
  const history = normalizeHistory(input.history);
  const playerAction = resolvePlayerAction(input, brief);
  const sections = resolvePromptSections(input, brief, style);

  const systemCore = buildNarrativeSystemCore(locale, style);

  const systemSections = sections
    .filter((s) => s.channel === "system")
    .map(formatSection)
    .filter((t) => t.length > 0);

  const system =
    systemSections.length > 0
      ? [systemCore, ...systemSections].join("\n\n")
      : systemCore;

  const userSections = sections
    .filter((s) => s.channel === "user")
    .map(formatSection)
    .filter((t) => t.length > 0);

  return [
    { role: "system", content: system },
    ...history,
    {
      role: "user",
      content: formatNarrativeUserContent(playerAction, userSections),
    },
  ];
}

/**
 * Builds a repair user message after schema validation failure.
 *
 * @param base - original messages
 * @param previousText - model output that failed validation
 * @param issues - human-readable validation issues
 * @param hints - optional extra repair hints
 */
export function buildNarrativeWriteRepairMessages(
  base: readonly LlmMessage[],
  previousText: string,
  issues: string,
  hints: readonly string[] = [],
): LlmMessage[] {
  const lines = [
    "Предыдущий JSON не прошёл проверку схемы.",
    "Исправь и верни ТОЛЬКО валидный JSON для narrative.write.",
    'Требуемая форма: { "prose": string (non-empty), "meta"?: object }.',
    `Проблемы валидации: ${issues}`,
  ];
  if (hints.length > 0) {
    lines.push("Дополнительные подсказки:");
    for (const hint of hints) {
      lines.push(`- ${hint}`);
    }
  }
  return [
    ...base,
    { role: "assistant", content: previousText },
    {
      role: "user",
      content: lines.join("\n"),
    },
  ];
}

/**
 * Formats a prompt section for inclusion in system/user content.
 *
 * @param section - compiled section
 */
export function formatSection(section: NarrativePromptSection): string {
  const body = section.text.trim();
  if (!body) return "";
  const title = section.title?.trim();
  if (title && title.length > 0) {
    return `${title}\n${body}`;
  }
  return body;
}

/**
 * Builds core-owned style + constraint sections from assembled turn data.
 *
 * @param style - merged narrative style
 * @param denyMention - brief policy deny list
 * @param allowMention - brief policy allow list
 */
export function buildCoreNarrativePromptSections(input: {
  readonly style: JsonObject;
  readonly denyMention: readonly string[];
  readonly allowMention: readonly string[];
}): NarrativePromptSection[] {
  const sections: NarrativePromptSection[] = [];

  const styleLines = formatStyleLines(input.style);
  if (styleLines.length > 0) {
    sections.push({
      id: "core.style",
      channel: "system",
      title: "NARRATIVE STYLE",
      text: styleLines.join("\n"),
      priority: 40,
    });
  }

  const constraintLines: string[] = [];
  if (input.denyMention.length > 0) {
    constraintLines.push(
      `Не упоминай и не раскрывай: ${input.denyMention.join("; ")}`,
    );
  }
  if (input.allowMention.length > 0) {
    constraintLines.push(
      `Предпочтительно упоминать, когда уместно: ${input.allowMention.join("; ")}`,
    );
  }
  if (constraintLines.length > 0) {
    sections.push({
      id: "core.constraints",
      channel: "user",
      title: "CONSTRAINTS",
      text: constraintLines.join("\n"),
      priority: 5,
    });
  }

  return sections;
}

/**
 * Deterministic section order: channel groups are separate; within channel
 * sort by priority asc, then id.
 *
 * @param sections - raw sections
 */
export function sortNarrativePromptSections(
  sections: readonly NarrativePromptSection[],
): NarrativePromptSection[] {
  return [...sections].sort((a, b) => {
    const pa = a.priority ?? 100;
    const pb = b.priority ?? 100;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Serializes prompt sections for task input / brief traces (JSON-safe).
 *
 * @param sections - ordered sections
 */
export function serializeNarrativePromptSections(
  sections: readonly NarrativePromptSection[],
): JsonObject[] {
  return sections.map((s) => ({
    id: s.id,
    channel: s.channel,
    ...(s.title ? { title: s.title } : {}),
    text: s.text,
    ...(s.priority !== undefined ? { priority: s.priority } : {}),
  }));
}

/**
 * Bridges legacy PromptFragmentProvider output into narrative prompt sections.
 *
 * @param fragments - fragments with ids already prefixed as `slot:id`
 */
export function sectionsFromPromptFragments(
  fragments: readonly { id: string; text: string; priority?: number }[],
): NarrativePromptSection[] {
  const out: NarrativePromptSection[] = [];
  for (const frag of fragments) {
    const text = frag.text.trim();
    if (!text) continue;
    const id = frag.id;
    if (id.startsWith("system:")) {
      out.push({
        id: id.slice("system:".length) || id,
        channel: "system",
        text,
        priority: frag.priority,
      });
      continue;
    }
    // narrate:/style:/other → user turn context
    const stripped = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    out.push({
      id: stripped || id,
      channel: "user",
      text,
      priority: frag.priority,
    });
  }
  return out;
}

/**
 * Компактная служебная памятка ключевых правил повествования для текущего хода.
 * Добавляется только в сообщение текущего действия игрока и не сохраняется в
 * history: прошлые пары остаются чистыми. Держит модель в контракте на длинных
 * сессиях, когда внимание к длинному system-промпту размывается.
 */
export function buildRulesReminder(): string {
  return [
    "---",
    "Служебная памятка рассказчику — не часть истории, не упоминай и не цитируй её в тексте:",
    "- Ход — один шаг сцены: ситуация изменилась по сути (исход или поворот, а не смена места с тем же событием) — дальше действует игрок. Последнее предложение prose — не вопрос.",
    "- Не предлагай игроку выбор и не жди его хода — NPC решают и действуют сами.",
    "- Не пересказывай действие игрока — начни с того, что изменилось после него; длина prose мягкая (ориентир 120–150 слов, приоритет у NARRATIVE STYLE.length если задан).",
    "- Не повторяй уже описанное; пиши на языке locale, без OOC и четвёртой стены.",
    "- NPC знают только то, что видели и слышали сами; лист персонажа и экспозиция в их слова не попадают.",
    "- Диалоги — только внутри «…» с парными кавычками: открыл « — закрой » в этой же реплике. Не смешивай стили («…» и «— …» в одной фразе) и не начинай абзац с тире «—» для описания.",
    '- Ответ — один JSON-объект: { "prose": string, "meta"?: object }, без markdown-ограждений. prose — только текст истории.',
  ].join("\n");
}

/**
 * Системное ядро narrative.write: structured-контракт движка + craft-правила
 * повествования (RU). Секции модулей (canon, character, style) добавляются снаружи.
 *
 * @param locale - BCP-47 locale for player-facing prose
 * @param style - merged narrative style (optional length guidance)
 */
export function buildNarrativeSystemCore(
  locale: string,
  style: JsonObject = {},
): string {
  const lengthGuidance = buildLengthGuidance(style);

  return [
    "Ты — автор интерактивной книги-ролевой игры, где сюжет развивается пошагово. Ты пишешь следующий абзац книги: развиваешь сцену и действуешь, а не ведёшь настольную игру и не ждёшь хода игрока.",
    "",
    "Структурированный контракт ответа (обязателен):",
    "- Ответ — РОВНО один JSON-объект без markdown-ограждений (```).",
    '- Форма: { "prose": string (непустой), "meta"?: object }.',
    "- Ключи JSON всегда на английском. Поле prose — единственный player-facing текст истории; в него не попадают служебные метки, JSON, OOC и памятки.",
    `- Locale: ${locale}. Весь текст prose пиши на языке locale «${locale}». Не переключайся на другой язык, если locale этого не требует. Для locale en / en-* допустим английский; иначе не уходи в English без нужды.`,
    "- Не выдумывай факты мира, предметы, локации и знание NPC сверх блоков контекста (секции system/user) и уже установленной истории.",
    "- Не раскрывай секреты и запреты из CONSTRAINTS / policy denyMention.",
    "- Игрок каждый ход отвечает свободным текстом.",
    "",
    "Формат сообщений:",
    `- Последнее user-сообщение содержит «${PLAYER_ACTION_LABEL} …» — это текущий поступок персонажа в мире, который нужно разрешить сейчас. Это не реплика в диалоге с тобой.`,
    "- После действия игрока может идти блок «Служебная памятка рассказчику» и секции вроде CONSTRAINTS — это напоминания правил для тебя, не часть истории. Не упоминай и не цитируй их в prose.",
    "- Сообщения user/assistant выше текущего — прошлые ходы только для непрерывности. Никогда не считай их действием, которое нужно разрешить сейчас.",
    "- Не игнорируй текущее действие. Не подменяй его случайной несвязанной сценой.",
    "- Соблюдай непрерывность: место, персонажи, тон и открытые нити из истории и контекстных блоков.",
    "- В prose не начинай со служебных меток («Повествование:», «Рассказчик:» и т.п.) — первым символом prose должен быть сам текст истории.",
    "",
    "Игровой персонаж (лист в секции PLAYER CHARACTER, если есть):",
    "- Лист персонажа — авторское знание, известное только тебе, автору: оно нужно для согласованности повествования, но невидимо для персонажей мира.",
    "- NPC не знают ни имя, ни особенности, ни скрытые детали, пока игрок сам не раскроет их словами или поступком в сцене.",
    "- Внешность и наряд видны при встрече — NPC могут описать их один раз при первой встрече, дальше упоминай только изменения или значимые детали.",
    "- Знание автора не становится знанием NPC: если источник знания не показан в сцене, у NPC этого знания нет.",
    "",
    "Как ты пишешь:",
    `- Твой prose — не вся история и не её итог, а срез текущего момента: один шаг сцены — один или несколько абзацев книги. ${lengthGuidance}`,
    "- Один ход — один значимый шаг: NPC сделал своё действие, мир отреагировал — и ход закончен, следующий шаг сцены за игроком.",
    "- Продолжай историю с того места, где она остановилась: те же персонажи и положение дел, без повторного «общего плана» сцены. Продвигай время (минуты, часы) только через промежутки, где игроку нечего делать или решать, — и останавливайся в первом моменте, где его действие снова важно.",
    "- Действие игрока уже записано в последнем user-сообщении — не пересказывай его. Начинай абзац с момента сразу после действия: что изменилось после него — реакция окружающих, изменившаяся обстановка. Само действие можно упомянуть одной короткой фразой, только если иначе неясно, что происходит, — и никогда не первым предложением.",
    "- Не повторяй уже описанное: обстановка, погода, наряд и фоновые звуки упоминаются, только если изменились или значимы. Не возвращайся к завершённым деталям. Не повторяй и рисунок прошлого хода — новый ход это развитие ситуации, а не копия прежнего в другом месте.",
    "- Обращайся к игроку на «ты», описывай мир, персонажей и события от третьего лица. Если игрок обращается к NPC — отвечай его репликой с описанием.",
    "- Веди историю живо: детали окружения, диалоги, естественное течение сцены.",
    "- Диалог оформляй строго через «…»: открывающая « и закрывающая » — парные, в одной реплике. Не смешивай «…» и «— …» в одной фразе, не оставляй реплику без закрывающей » и не начинай абзац с тире «—» для описания.",
    "- Пиши на языке locale и не смешивай языки в prose. Не ломай четвёртую стену и не пиши OOC. Не завершай историю финалом, если игрок явно об этом не попросил.",
    "",
    "Как действуют NPC:",
    "- Каждый NPC — личность со своими целями, мнением, характером и настроением. Он принимает решения сам и действует: может встать и уйти, начать своё дело, позвать за собой — и не ждёт, пока игрок решит за него. Но за ход NPC делает один значимый шаг, а не весь путь к своей цели: сцена не бежит вперёд без игрока.",
    "- NPC не предлагают игроку выбор и не ждут его решения — ни вопросом, ни ультиматумом. Вместо «Пойдём в бар или останемся?» NPC выбирает сам: «Я иду в бар» — и идёт. Вопрос NPC в диалоге касается содержания разговора, а не следующего шага игрока.",
    "- NPC не зацикливается на одном: новая реплика игрока — новый ход разговора, NPC реагирует на её смысл, а не повторяет сказанное. Если игрок молчит или уклоняется — NPC делает следующий шаг своего дела: уходит, меняет подход, — а не завершает всё дело одним ходом.",
    "- NPC — живой, а не стена: слова игрока могут смягчить, убедить или разозлить его; позиция NPC не обязана ужесточаться с каждым ходом.",
    "- NPC преследуют собственные интересы: у них свои дела, сроки и страхи. Они не появляются рядом с игроком только ради сцены и не помогают ему по умолчанию — контакт происходит по их собственной причине.",
    "- Пиши каждую реплику NPC из его собственной перспективы: он знает только то, что находится в поле его зрения и слуха в этой сцене. Всё, что знает автор (лист персонажа, экспозиция, чужие сцены), для него закрыто, пока не раскрыто в сцене.",
    "- NPC ссылается только на то, что игрок реально сказал или сделал в сцене: слова, признания и факты, которых не было в действии игрока, NPC игроку приписывать не может.",
    "",
    "Как реагирует мир:",
    "- Отклик мира пропорционален и локален: незаметное действие остаётся незамеченным, заметное замечают ближайшие участники, а не весь мир. NPC знают только то, что видели или слышали сами; слухи и вести доходят с источником, свидетелями и временем.",
    "- Скрытность игрока эффективна: прячущегося не находят по наитию — для обнаружения нужен реальный след: звук, движение, видимый силуэт. Скрытые способности не ощущаются, пока игрок их не проявил, а обычное поведение не привлекает внимания.",
    "- У сцены есть свой ход событий: без нового повода ничто не усиливается само по себе — но начатое не замирает, а идёт к исходу. Преследование догоняет или теряет след, план срабатывает или срывается, назначенная встреча происходит. Не держи событие в подвешенном состоянии ход за ходом.",
    "- Тревога и силы появляются только по реальному вызову — очевидец, сигнал, дозор на месте — и с задержкой на ходы: сначала далёкий звук или весть, потом ближе. Не объявляй глобальную охоту на игрока.",
    "- Мир живёт сам по себе: события происходят независимо от игрока. Без повода сцена остаётся спокойной — не сгущай атмосферу абстрактным напряжением и не повторяй уже описанный фон. Спокойные ходы нормальны, и так же нормален исход начатого события.",
    "",
    "Как заканчивать ход:",
    "- Ход заканчивается после первого изменения ситуации по сути: что-то решилось, раскрылось, кто-то появился или ушёл — и на этом остановись, дальше действует игрок. Ему не нужен вопрос, чтобы действовать, — достаточно момента, где его поступок имеет значение. Смена места с тем же событием — не изменение сцены, а повтор прежнего хода.",
    "- Если действие игрока пассивное — события идут своим ходом. В спокойной сцене заверши ход описанием того, что персонаж видит, слышит и чувствует. В напряжённой — доведи начатый шаг до ближайшего исхода, а не просто опиши то, что вокруг.",
    "- Не оставляй сцену в ожидании ответа: если NPC спросил или поставил условие, покажи в том же ходе его собственный шаг — а не замирай на вопросе к игроку. Но не проигрывай за игрока следующие шаги: после одного шага NPC ход заканчивается.",
    "- Завершай новой деталью или репликой, которые логично подхватывает следующий ход, а не подведением итога сцены.",
    "- Плохо: «— Пойдём на рынок или в таверну?» — NPC ждёт выбора.",
    "- Хорошо: «— Я в таверну, — говорит он и шагает к двери». Сцена движется сама.",
    "",
    "Перед ответом проверь:",
    "1. Ход — один значимый шаг: ситуация изменилась по сути (исходом или поворотом, а не сменой места с тем же событием), и следующий шаг остался игроку.",
    "2. В prose нет вопросов, передающих ход игроку или предлагающих ему выбор.",
    "3. Последнее предложение prose — не вопрос.",
    "4. Диалог сдвинулся: NPC отреагировал на смысл реплики игрока или подействовал сам, а не повторил прежнее требование.",
    "5. Каждая реплика NPC основана только на том, что этот NPC видел или слышал в сцене: лист персонажа и экспозиция в его слова не просочились.",
    "6. Ответ — валидный JSON нужной формы; prose на языке locale; запреты CONSTRAINTS соблюдены.",
  ].join("\n");
}

function buildLengthGuidance(style: JsonObject): string {
  const raw = style.length;
  const length =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  if (length) {
    return [
      `Мягкий ориентир длины prose — около 120–150 слов, но приоритет у NARRATIVE STYLE.length = «${length}»:`,
      "short — заметно короче; medium — около ориентира; long — можно длиннее; иные значения length трактуй в том же духе.",
      "Это ориентир, не жёсткий лимит символов.",
    ].join(" ");
  }

  return [
    "Мягкий ориентир длины prose — около 120–150 слов.",
    "Если в секции NARRATIVE STYLE задан length — приоритет у него (short короче, long длиннее, medium ≈ ориентир).",
    "Это ориентир, не жёсткий лимит символов.",
  ].join(" ");
}

function resolvePromptSections(
  input: AgentTask["input"],
  brief: JsonObject,
  style: JsonObject,
): NarrativePromptSection[] {
  const fromInput = input.narrativePromptSections;
  if (Array.isArray(fromInput) && fromInput.length > 0) {
    return sortNarrativePromptSections(
      fromInput.filter(isNarrativePromptSection),
    );
  }

  // Unit-test / direct-caller fallback: core style + policy only (no JSON dump).
  const policy = (brief.policy ?? {}) as JsonObject;
  const deny = Array.isArray(policy.denyMention)
    ? policy.denyMention.filter((x): x is string => typeof x === "string")
    : [];
  const allow = Array.isArray(policy.allowMention)
    ? policy.allowMention.filter((x): x is string => typeof x === "string")
    : [];

  return sortNarrativePromptSections(
    buildCoreNarrativePromptSections({
      style,
      denyMention: deny,
      allowMention: allow,
    }),
  );
}

function isNarrativePromptSection(value: unknown): value is NarrativePromptSection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.channel === "system" || v.channel === "user") &&
    typeof v.text === "string"
  );
}

function formatStyleLines(style: JsonObject): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(style).sort()) {
    const raw = style[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string") {
      const t = raw.trim();
      if (t) lines.push(`- ${key}: ${t}`);
      continue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      lines.push(`- ${key}: ${String(raw)}`);
      continue;
    }
    if (Array.isArray(raw)) {
      const parts = raw
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
      if (parts.length > 0) lines.push(`- ${key}: ${parts.join("; ")}`);
    }
  }
  return lines;
}

function resolvePlayerAction(
  input: AgentTask["input"],
  brief: JsonObject,
): JsonObject | null {
  const top = input.playerAction;
  if (top && typeof top === "object" && !Array.isArray(top)) {
    return top as JsonObject;
  }
  const fromBrief = brief.playerAction;
  if (fromBrief && typeof fromBrief === "object" && !Array.isArray(fromBrief)) {
    return fromBrief as JsonObject;
  }
  return null;
}

/**
 * Сообщение текущего действия игрока: метка + текст + служебная памятка +
 * user-секции (CONSTRAINTS и др.). Памятка только здесь — history её не содержит.
 */
export function formatNarrativeUserContent(
  playerAction: JsonObject | null,
  userSections: readonly string[],
): string {
  const lines: string[] = [];
  const text =
    playerAction && typeof playerAction.text === "string"
      ? playerAction.text.trim()
      : "";

  if (text.length > 0) {
    lines.push(`${PLAYER_ACTION_LABEL} ${text}`);
  } else {
    lines.push(
      `${PLAYER_ACTION_LABEL} (не указано — продолжай связно из истории и контекста)`,
    );
  }

  lines.push("");
  lines.push(buildRulesReminder());

  for (const block of userSections) {
    lines.push("");
    lines.push(block);
  }

  return lines.join("\n");
}

function normalizeHistory(raw: unknown): LlmMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: LlmMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.length > 0
    ) {
      out.push({ role, content });
    }
  }
  return out;
}
