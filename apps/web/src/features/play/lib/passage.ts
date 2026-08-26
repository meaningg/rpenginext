/** Maintenance / restore markers produced by core for non-player turns. */
const INTERNAL_PROSE_RE = /^\((?:system|restore)\)(?:\s|$)/i;

/** Opening dash used for literary dialogue lines. */
const SPEECH_LINE_RE = /^[—–−]\s+\S/;

/** Sentence-end punctuation: a dialogue dash may follow one of these. */
const SENTENCE_END_SET = new Set([".", "!", "?", "…", "»", '"', "”"]);

/** Characters that terminate a sentence for dense-prose grouping. */
const SENTENCE_ENDER_SET = new Set([".", "!", "?", "…"]);

/** Closing quote chars that can trail a sentence end. */
const TRAILING_QUOTE_SET = new Set(['"', "»", "”", "'"]);

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
 * Role is "speech" only for paragraphs that consist entirely of dialogue;
 * mixed paragraphs stay "narration" and highlight dialogue runs inline.
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
    const spans = parseNarrativeSpans(paragraph);
    return {
      role: blockRole(spans),
      spans,
    };
  });
}

/**
 * A block is a speech block only when every non-whitespace span is dialogue.
 * Mixed paragraphs (dialogue + narration) stay narration so the whole block
 * is not highlighted when only a part of it is a replica.
 *
 * @param spans - parsed spans of the paragraph
 */
function blockRole(spans: readonly NarrativeSpan[]): NarrativeBlock["role"] {
  const hasProseText = spans.some(
    (span) => span.kind === "text" && span.text.trim().length > 0,
  );
  return hasProseText ? "narration" : "speech";
}

/**
 * Soft-splits a dense paragraph so reading is not one solid wall.
 *
 * @param text - single paragraph candidate
 */
function softSplitDenseProse(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const bySpeech = splitBeforeDialogueDashes(trimmed);
  if (bySpeech.length > 1) {
    return bySpeech.flatMap((part) => groupLongSentences(part));
  }

  return groupLongSentences(trimmed);
}

/**
 * Splits prose before a dialogue dash (`—`) that follows sentence-end
 * punctuation. Dashes inside `«…»` are never split points, so a quoted
 * dialogue with inner dashes stays one unit.
 *
 * @param text - paragraph without natural breaks
 */
function splitBeforeDialogueDashes(text: string): string[] {
  const parts: string[] = [];
  let last = 0;
  let inGuillemets = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (ch === "«") {
      inGuillemets = true;
    } else if (ch === "»") {
      inGuillemets = false;
    }
    if (
      !inGuillemets &&
      SENTENCE_END_SET.has(ch) &&
      isDashLineStart(text, i + 1)
    ) {
      parts.push(text.slice(last, i + 1));
      last = i + 1;
    }
  }

  parts.push(text.slice(last));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * True when the text from `from` (after sentence-end punctuation) continues
 * with whitespace, a dash, whitespace and a non-whitespace character —
 * i.e. a new dialogue line starts here.
 *
 * @param text - full paragraph
 * @param from - index right after the sentence-end punctuation
 */
function isDashLineStart(text: string, from: number): boolean {
  let j = from;
  while (j < text.length && isWhitespace(text[j] ?? "")) j += 1;
  if (j >= text.length || !isDashChar(text[j])) return false;
  const afterDash = text[j + 1] ?? "";
  const afterDash2 = text[j + 2] ?? "";
  return (
    isWhitespace(afterDash) && afterDash2.length > 0 && !isWhitespace(afterDash2)
  );
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

  const sentences = splitSentencesOutsideQuotes(text);
  if (sentences.length < 3) return [text];

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
 * Detects dialogue paragraphs (leading em-dash / guillemet-only) so dense
 * grouping does not tear dialogue lines apart.
 *
 * @param text - paragraph text
 */
function isSpeechParagraph(text: string): boolean {
  const t = text.trim();
  if (SPEECH_LINE_RE.test(t)) return true;
  return /^«[^»]+»(?:\s*[.!?…]+)?$/u.test(t);
}

/**
 * Splits dense prose into sentences without breaking guillemet quotes:
 * `.`, `!`, `?` and `…` inside `«…»` do not terminate a sentence.
 *
 * @param text - paragraph text
 */
function splitSentencesOutsideQuotes(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let inGuillemets = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (ch === "«") {
      inGuillemets = true;
    } else if (ch === "»") {
      inGuillemets = false;
    } else if (!inGuillemets && SENTENCE_ENDER_SET.has(ch)) {
      let j = i;
      while (j < text.length && SENTENCE_ENDER_SET.has(text[j] ?? "")) j += 1;
      while (j < text.length && TRAILING_QUOTE_SET.has(text[j] ?? "")) j += 1;
      out.push(text.slice(start, j));
      start = j;
      i = j - 1;
    }
  }

  if (start < text.length) out.push(text.slice(start));
  return out;
}

/**
 * Tokenizes a paragraph into narration, quoted/dash dialogue and emphasis
 * spans. `— … —` and `— …»` runs are dialogue spans when the dash starts the
 * paragraph or follows sentence-end punctuation; mid-sentence parenthetical
 * dashes stay plain narration.
 *
 * @param text - paragraph text
 */
function parseNarrativeSpans(text: string): NarrativeSpan[] {
  const spans: NarrativeSpan[] = [];
  let last = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "«") {
      const end = findGuillemetEnd(text, i);
      if (end !== -1) {
        pushTextSpan(spans, text.slice(last, i));
        spans.push({ kind: "speech", text: text.slice(i, end) });
        last = end;
        i = end;
        continue;
      }
    } else if (ch === "“") {
      const end = findSmartQuoteEnd(text, i);
      if (end !== -1) {
        pushTextSpan(spans, text.slice(last, i));
        spans.push({ kind: "speech", text: text.slice(i, end) });
        last = end;
        i = end;
        continue;
      }
    } else if (ch === '"') {
      const end = findStraightQuoteEnd(text, i);
      if (end !== -1) {
        pushTextSpan(spans, text.slice(last, i));
        spans.push({ kind: "speech", text: text.slice(i, end) });
        last = end;
        i = end;
        continue;
      }
    } else if (ch === "*" || ch === "_") {
      const end = findEmphasisEnd(text, i, ch);
      if (end !== -1) {
        pushTextSpan(spans, text.slice(last, i));
        const inner = text.slice(i + 1, end - 1);
        if (inner.trim()) {
          spans.push({ kind: "emphasis", text: inner });
        } else {
          pushTextSpan(spans, text.slice(i, end));
        }
        last = end;
        i = end;
        continue;
      }
    } else if (isDashChar(ch) && isDashDialogueStart(text, i)) {
      const end = findDashRunEnd(text, i + 1);
      pushTextSpan(spans, text.slice(last, i));
      spans.push({ kind: "speech", text: text.slice(i, end) });
      last = end;
      i = end;
      continue;
    }

    i += 1;
  }

  if (last < text.length) {
    pushTextSpan(spans, text.slice(last));
  }

  if (spans.length === 0) {
    spans.push({ kind: "text", text });
  }

  return spans;
}

/**
 * Finds the closing guillemet for a `«` at `from` (index after `»`).
 *
 * @param text - paragraph text
 * @param from - index of the opening `«`
 */
function findGuillemetEnd(text: string, from: number): number {
  const close = text.indexOf("»", from + 1);
  return close === -1 ? -1 : close + 1;
}

/**
 * Finds the closing smart quote for a `“` at `from` (index after `”`).
 *
 * @param text - paragraph text
 * @param from - index of the opening `“`
 */
function findSmartQuoteEnd(text: string, from: number): number {
  const close = text.indexOf("”", from + 1);
  return close === -1 ? -1 : close + 1;
}

/**
 * Finds the closing straight quote for a `"` at `from`, mirroring the old
 * `"[^"\n]{1,280}"` token: no newlines, at most 280 chars inside.
 *
 * @param text - paragraph text
 * @param from - index of the opening `"`
 */
function findStraightQuoteEnd(text: string, from: number): number {
  const MAX_QUOTE_LEN = 280;
  let i = from + 1;
  let count = 0;
  while (i < text.length && count < MAX_QUOTE_LEN) {
    const ch = text[i];
    if (ch === "\n") return -1;
    if (ch === '"') return i + 1;
    i += 1;
    count += 1;
  }
  return -1;
}

/**
 * Finds the closing emphasis marker for `*`/`_` at `from`, mirroring the old
 * `\*[^*\n]{1,200}\*` / `_[^_\n]{1,200}_` tokens.
 *
 * @param text - paragraph text
 * @param from - index of the opening marker
 * @param marker - the marker char (`*` or `_`)
 */
function findEmphasisEnd(text: string, from: number, marker: string): number {
  const MAX_EMPHASIS_LEN = 200;
  let i = from + 1;
  let count = 0;
  while (i < text.length && count < MAX_EMPHASIS_LEN) {
    const ch = text[i];
    if (ch === "\n") return -1;
    if (ch === marker) return i + 1;
    i += 1;
    count += 1;
  }
  return -1;
}

/**
 * True when a dash at `i` opens a dialogue run: it is `— ` + non-space and
 * starts the paragraph or follows sentence-end punctuation.
 *
 * @param text - paragraph text
 * @param i - index of the dash
 */
function isDashDialogueStart(text: string, i: number): boolean {
  if (!isDashChar(text[i] ?? "")) return false;
  const afterDash = text[i + 1] ?? "";
  const afterDash2 = text[i + 2] ?? "";
  if (!isWhitespace(afterDash) || !afterDash2 || isWhitespace(afterDash2)) {
    return false;
  }

  let j = i - 1;
  while (j >= 0 && isWhitespace(text[j] ?? "")) j -= 1;
  if (j < 0) return true;
  return SENTENCE_END_SET.has(text[j] ?? "");
}

/**
 * Finds the end of a dash dialogue run started by a dash at `i + 1`.
 * The run closes at the next dash, at a closing guillemet (`»`), or at the
 * end of the paragraph. Nested `«…»` pairs inside the run are skipped.
 *
 * @param text - paragraph text
 * @param from - index right after the opening dash
 */
function findDashRunEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "«") {
      const close = text.indexOf("»", i + 1);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (isDashChar(ch) || ch === "»") return i + 1;
    i += 1;
  }
  return text.length;
}

function isDashChar(ch: string | undefined): boolean {
  return ch === "—" || ch === "–" || ch === "−";
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
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
