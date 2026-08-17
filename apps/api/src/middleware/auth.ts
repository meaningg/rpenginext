import { failure, type Failure, type Result, ok, err } from "@rpengineext/contracts";

import type { HostDb, HostPlayer } from "../persistence/host-db.ts";
import { jsonError, statusForFailure } from "./http.ts";

export interface AuthContext {
  readonly player: HostPlayer;
  readonly token: string;
}

/**
 * Extracts bearer token from Authorization header.
 *
 * @param request - HTTP request
 */
export function readBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

/**
 * Authenticates a request against host db.
 *
 * @param request - HTTP request
 * @param hostDb - host identity store
 */
export function authenticateRequest(
  request: Request,
  hostDb: HostDb,
): Result<AuthContext, Failure> {
  const playerId = request.headers.get("x-player-id")?.trim();
  const token = readBearerToken(request);
  if (!playerId || !token) {
    return err(
      failure(
        "PERMISSION_DENIED",
        "missing X-Player-Id or Authorization Bearer token",
      ),
    );
  }
  const auth = hostDb.authenticate(playerId, token);
  if (!auth.ok) return auth;
  return ok({ player: auth.value, token });
}

/**
 * Auth helper returning Response on failure.
 *
 * @param request - request
 * @param hostDb - host db
 */
export function requireAuth(
  request: Request,
  hostDb: HostDb,
): { ok: true; value: AuthContext } | { ok: false; response: Response } {
  const auth = authenticateRequest(request, hostDb);
  if (!auth.ok) {
    return {
      ok: false,
      response: jsonError(auth.error, statusForFailure(auth.error)),
    };
  }
  return { ok: true, value: auth.value };
}
