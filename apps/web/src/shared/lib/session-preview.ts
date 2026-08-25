import { loadTranscript } from "./chat-transcript.ts";

/**
 * Last durable line preview for a session resume row.
 *
 * @param sessionId - session key
 * @param maxLen - clamp length
 */
export function getSessionPreview(
  sessionId: string,
  maxLen = 96,
): string | null {
  const messages = loadTranscript(sessionId);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.streaming) continue;
    const text = msg.content.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen - 1).trimEnd()}…`;
  }
  return null;
}
