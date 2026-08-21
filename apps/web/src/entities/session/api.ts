import { http } from "../../shared/api/http.ts";
import type { PlayerCredentials } from "../player/model.ts";
import type { TurnResult } from "../turn/model.ts";
import type { SessionSummary, SessionView } from "./model.ts";

/**
 * Lists sessions for the player.
 *
 * @param player - credentials
 */
export async function listSessions(
  player: PlayerCredentials,
): Promise<SessionSummary[]> {
  const data = await http<{ sessions: SessionSummary[] }>("/v1/sessions", {
    player,
  });
  return data.sessions;
}

/**
 * Creates a session from a template.
 *
 * @param player - credentials
 * @param templateId - story template
 * @param title - optional session title
 */
export async function createSession(
  player: PlayerCredentials,
  templateId: string,
  title?: string,
): Promise<{ session: SessionView; openingTurn?: TurnResult }> {
  return http("/v1/sessions", {
    method: "POST",
    player,
    body: { templateId, title, runOpening: true },
  });
}

/**
 * Loads a session view.
 *
 * @param player - credentials
 * @param sessionId - session id
 */
export async function getSession(
  player: PlayerCredentials,
  sessionId: string,
): Promise<SessionView> {
  const data = await http<{ session: SessionView }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}`,
    { player },
  );
  return data.session;
}

/**
 * Renames a session.
 *
 * @param player - credentials
 * @param sessionId - session id
 * @param title - new title
 */
export async function renameSession(
  player: PlayerCredentials,
  sessionId: string,
  title: string,
): Promise<SessionSummary> {
  const data = await http<{ session: SessionSummary }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      player,
      body: { title },
    },
  );
  return data.session;
}

/**
 * Deletes a session ownership binding.
 *
 * @param player - credentials
 * @param sessionId - session id
 */
export async function deleteSession(
  player: PlayerCredentials,
  sessionId: string,
): Promise<void> {
  await http<{ sessionId: string }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      player,
    },
  );
}

/**
 * Explicitly saves a session.
 *
 * @param player - credentials
 * @param sessionId - session id
 */
export async function saveSession(
  player: PlayerCredentials,
  sessionId: string,
): Promise<{ revision: number; savedAt: string }> {
  return http(`/v1/sessions/${encodeURIComponent(sessionId)}/save`, {
    method: "POST",
    player,
  });
}
