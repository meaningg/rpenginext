const TRANSCRIPT_PREFIX = "rp.chat.";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly content: string;
  readonly createdAt: string;
  readonly streaming?: boolean;
}

/**
 * Loads a session chat transcript from local storage.
 *
 * @param sessionId - session key
 */
export function loadTranscript(sessionId: string): ChatMessage[] {
  if (!sessionId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(TRANSCRIPT_PREFIX + sessionId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

/**
 * Persists a session chat transcript.
 *
 * @param sessionId - session key
 * @param messages - ordered messages
 */
export function saveTranscript(
  sessionId: string,
  messages: readonly ChatMessage[],
): void {
  if (!sessionId || typeof localStorage === "undefined") return;
  const durable = messages
    .filter((m) => m.role !== "system" && !m.streaming && m.content.trim())
    .map(({ id, role, content, createdAt }) => ({
      id,
      role,
      content,
      createdAt,
    }));
  localStorage.setItem(
    TRANSCRIPT_PREFIX + sessionId,
    JSON.stringify(durable),
  );
}

/**
 * Removes a stored transcript for a session.
 *
 * @param sessionId - session key
 */
export function clearTranscript(sessionId: string): void {
  if (!sessionId || typeof localStorage === "undefined") return;
  localStorage.removeItem(TRANSCRIPT_PREFIX + sessionId);
}

/**
 * Creates a chat message id.
 */
export function createMessageId(prefix = "msg"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    (row.role === "user" ||
      row.role === "assistant" ||
      row.role === "system") &&
    typeof row.content === "string" &&
    typeof row.createdAt === "string"
  );
}
