import type { Passage } from "../turn/model.ts";

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
}
