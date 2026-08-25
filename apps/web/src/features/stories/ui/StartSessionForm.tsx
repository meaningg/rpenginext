import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Button,
  ErrorState,
  Input,
  Surface,
} from "../../../design-system/index.ts";
import { useCreateSessionMutation } from "../../../entities/session/queries.ts";
import { COPY } from "../../../shared/config/copy.ts";

/**
 * Start a new play session from a story template.
 */
export function StartSessionForm({
  templateId,
}: {
  readonly templateId: string;
}) {
  const navigate = useNavigate();
  const createSession = useCreateSessionMutation();
  const [title, setTitle] = useState("");

  const start = async () => {
    const result = await createSession.mutateAsync({
      templateId,
      title: title.trim() || undefined,
    });
    navigate(`/play/${result.session.sessionId}`);
  };

  return (
    <Surface className="space-y-4 p-5">
      <div className="space-y-1.5">
        <label
          htmlFor="session-title"
          className="text-sm font-medium text-fg"
        >
          {COPY.stories.sessionTitle}
        </label>
        <Input
          id="session-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={COPY.stories.sessionTitlePlaceholder}
          maxLength={120}
          disabled={createSession.isPending}
        />
        <p className="text-xs text-fg-faint">{COPY.stories.sessionTitleHint}</p>
      </div>

      {createSession.isError ? (
        <ErrorState
          message={
            createSession.error instanceof Error
              ? createSession.error.message
              : COPY.common.error
          }
        />
      ) : null}

      <Button
        size="lg"
        loading={createSession.isPending}
        onClick={() => void start()}
        className="w-full sm:w-auto"
      >
        {createSession.isPending ? COPY.stories.starting : COPY.stories.start}
      </Button>
    </Surface>
  );
}
