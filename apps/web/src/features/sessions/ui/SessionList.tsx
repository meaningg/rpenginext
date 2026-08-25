import type { SessionSummary } from "../../../entities/session/model.ts";
import { SessionRow } from "./SessionRow.tsx";

/**
 * Ordered session resume list.
 */
export function SessionList({
  sessions,
  storyById,
  onRename,
  onDelete,
}: {
  readonly sessions: readonly SessionSummary[];
  readonly storyById: ReadonlyMap<string, string>;
  readonly onRename: (sessionId: string, title: string) => Promise<void>;
  readonly onDelete: (sessionId: string) => Promise<void>;
}) {
  return (
    <ul className="space-y-1.5">
      {sessions.map((session) => (
        <li key={session.sessionId}>
          <SessionRow
            session={session}
            storyTitle={storyById.get(session.templateId)}
            onRename={(title) => onRename(session.sessionId, title)}
            onDelete={() => onDelete(session.sessionId)}
          />
        </li>
      ))}
    </ul>
  );
}
