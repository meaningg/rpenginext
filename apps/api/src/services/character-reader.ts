import type { HostRuntime } from "@rpengineext/host-bootstrap";
import {
  READ_MODEL_PROFILE,
  type CharacterProfile,
} from "@rpengineext/module-character";

/**
 * Reads the current player-character profile for a session.
 *
 * Resolves the module-owned `character.profile` read-model against the live
 * world state. Returns null when the session is not attached (no state in
 * memory) or the character module is absent from the host composition.
 */
export type ReadCharacterProfile = (sessionId: string) => CharacterProfile | null;

/**
 * Builds the character profile reader from a host runtime.
 *
 * @param runtime - host runtime exposing engine state + read-models
 */
export function createCharacterProfileReader(
  runtime: HostRuntime,
): ReadCharacterProfile {
  return (sessionId) => {
    const state = runtime.runtime.getSessionState(sessionId);
    if (!state) return null;
    const result = runtime.runtime
      .getHostSurface()
      .getReadModel(READ_MODEL_PROFILE, state, {}, "api-host");
    return result.ok ? (result.value as CharacterProfile) : null;
  };
}