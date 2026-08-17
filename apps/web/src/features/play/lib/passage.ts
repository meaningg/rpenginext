/** Maintenance / restore markers produced by core for non-player turns. */
const INTERNAL_PROSE_RE = /^\((?:system|restore)\)(?:\s|$)/i;

/** Opening dash used for literary dialogue lines. */
const SPEECH_LINE_RE = /^[—–−]\s+\S/;

/** Soft break before a new dialogue line after sentence end. */
const BEFORE_SPEECH_BREAK_RE = /(?<=[.!?…»"”])\s+(?=—\s+\S)/u;

/** Dense prose: group sentences so walls of text can breathe. */
const SENTENCE_RE = /[^.!?…]+(?:[.!?…]+["»”']*|$)/gu;

const DENSE_PROSE_MIN_CHARS = 280;
const DENSE_GROUP_MIN_CHARS = 120;
const DENSE_GROUP_MIN_SENTENCES = 2;

/**
 * Inline run inside a narrative block.
 */
export type NarrativeSpan =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "speech"; readonly text: string }
  | { readonly kind: "emphasis"; readonly text: string };

/**
 * One readable block in the narrator stream.
 */
export type NarrativeBlock = {
  readonly role: "narration" | "speech";
  readonly spans: readonly NarrativeSpan[];
};

/**
 * True when prose is an internal engine marker, not player-facing narrative.
 *
 * @param prose - passage text
 */
export function isInternalPassageProse(prose: string): boolean {
  return INTERNAL_PROSE_RE.test(prose.trim());
}

/**
 * Player UI should only react to player turns (system/background is silent).
 *
 * @param turnKind - engine turn kind
 */
export function isPlayerTurnKind(turnKind: unknown): boolean {
  return turnKind == null || turnKind === "player";
}

/**
 * Splits narrator prose into readable paragraphs.
 * Prefers blank-line breaks; falls back to single newlines for denser text.
 * Long single blocks are soft-split before dialogue and by sentence groups.
 *
 * @param content - full prose block
 */
export function splitNarrativeParagraphs(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const byBlank = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byBlank.length > 1) {
    return byBlank.flatMap((part) => softSplitDenseProse(part));
  }

  const byLine = normalized
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  if (byLine.length > 1) {
    return byLine.flatMap((part) => softSplitDenseProse(part));
  }

  return softSplitDenseProse(normalized);
}

/**
 * Parses narrator prose into blocks with speech / emphasis spans for reading UI.
 *
 * @param content - full prose block
 */
export function parseNarrativeBlocks(content: string): NarrativeBlock[] {
  return splitNarrativeParagraphs(content).map((paragraph) => {
    const role = isSpeechParagraph(paragraph) ? "speech" : "narration";
    return {
      role,
      spans: parseNarrativeSpans(paragraph),
    };
  });
}

/**
 * Soft-splits a dense paragraph so reading is not one solid wall.
 *
 * @param text - single paragraph candidate
 */
function softSplitDenseProse(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const bySpeech = trimmed
    .split(BEFORE_SPEECH_BREAK_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  if (bySpeech.length > 1) {
    return bySpeech.flatMap((part) => groupLongSentences(part));
  }

  return groupLongSentences(trimmed);
}

/**
 * Groups long narration into multi-sentence paragraphs.
 *
 * @param text - paragraph without natural breaks
 */
function groupLongSentences(text: string): string[] {
  if (text.length < DENSE_PROSE_MIN_CHARS || isSpeechParagraph(text)) {
    return [text];
  }

  const sentences = text.match(SENTENCE_RE);
  if (!sentences || sentences.length < 3) return [text];

  const groups: string[] = [];
  let buffer = "";
  let count = 0;

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    buffer = buffer ? `${buffer} ${sentence}` : sentence;
    count += 1;
    if (count >= DENSE_GROUP_MIN_SENTENCES && buffer.length >= DENSE_GROUP_MIN_CHARS) {
      groups.push(buffer);
      buffer = "";
      count = 0;
    }
  }

  if (buffer) groups.push(buffer);
  return groups.length > 1 ? groups : [text];
}

/**
 * Detects literary dialogue paragraphs (leading em-dash / guillemet-only).
 *
 * @param text - paragraph text
 */
function isSpeechParagraph(text: string): boolean {
  const t = text.trim();
  if (SPEECH_LINE_RE.test(t)) return true;
  return /^«[^»]+»(?:\s*[.!?…]+)?$/u.test(t);
}

/**
 * Tokenizes a paragraph into narration, quoted speech and emphasis spans.
 *
 * @param text - paragraph text
 */
function parseNarrativeSpans(text: string): NarrativeSpan[] {
  const spans: NarrativeSpan[] = [];
  // «…» | “…” | "…" | *…* | _…_
  const tokenRe =
    /«[^»]+»|“[^”]+”|"[^"\n]{1,280}"|\*[^*\n]{1,200}\*|_[^_\n]{1,200}_/gu;

  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > last) {
      pushTextSpan(spans, text.slice(last, match.index));
    }

    const token = match[0];
    if (token.startsWith("*") || token.startsWith("_")) {
      const inner = token.slice(1, -1);
      if (inner.trim()) {
        spans.push({ kind: "emphasis", text: inner });
      } else {
        pushTextSpan(spans, token);
      }
    } else {
      spans.push({ kind: "speech", text: token });
    }

    last = match.index + token.length;
  }

  if (last < text.length) {
    pushTextSpan(spans, text.slice(last));
  }

  if (spans.length === 0) {
    spans.push({ kind: "text", text });
  }

  return spans;
}

function pushTextSpan(spans: NarrativeSpan[], text: string): void {
  if (!text) return;
  const prev = spans[spans.length - 1];
  if (prev?.kind === "text") {
    spans[spans.length - 1] = { kind: "text", text: prev.text + text };
    return;
  }
  spans.push({ kind: "text", text });
}
