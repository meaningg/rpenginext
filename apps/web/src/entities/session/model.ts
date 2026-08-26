import type { Passage } from "../turn/model.ts";

/**
 * Current player-character profile (module `character.profile` read-model).
 * All text fields are present; empty strings when no character is seeded.
 */
export interface CharacterProfile {
  readonly present: boolean;
  readonly name: string;
  readonly appearance: string;
  readonly features: string;
  readonly outfit: string;
}

/**
 * Session row in the resume list.
 */
export interface SessionSummary {
  readonly sessionId: string;
  readonly playerId: string;
  readonly templateId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Full session view for play hydrate.
 */
export interface SessionView extends SessionSummary {
  readonly passage: Passage | null;
  /** Character profile; null when the read-model is unavailable (module absent). */
  readonly character: CharacterProfile | null;
}
