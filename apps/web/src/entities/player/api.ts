import { http } from "../../shared/api/http.ts";
import type { PlayerCredentials } from "./model.ts";

const PLAYER_KEY = "rp.player";

/**
 * Loads player credentials from localStorage.
 */
export function loadPlayer(): PlayerCredentials | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerCredentials;
  } catch {
    return null;
  }
}

/**
 * Persists player credentials.
 *
 * @param player - credentials
 */
export function savePlayer(player: PlayerCredentials): void {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

/**
 * Ensures a local player identity exists.
 *
 * @param displayName - name used on first registration
 */
export async function ensurePlayer(
  displayName = "Читатель",
): Promise<PlayerCredentials> {
  const existing = loadPlayer();
  if (existing) return existing;

  const data = await http<{
    playerId: string;
    token: string;
    displayName: string;
  }>("/v1/players", {
    method: "POST",
    body: { displayName },
  });

  const player: PlayerCredentials = {
    playerId: data.playerId,
    token: data.token,
    displayName: data.displayName,
  };
  savePlayer(player);
  return player;
}
