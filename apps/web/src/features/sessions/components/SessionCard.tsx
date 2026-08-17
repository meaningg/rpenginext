import { useState } from "react";
import { Link } from "react-router-dom";

import type { SessionSummary } from "../../../shared/api/client.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { formatUpdatedAt } from "../../../shared/lib/format.ts";
import { Button, Card, Input, Modal } from "../../../shared/ui/index.ts";

/**
 * Resume card with rename/delete actions.
 */
export function SessionCard({
  session,
  storyTitle,
  onRename,
  onDelete,
}: {
  readonly session: SessionSummary;
  readonly storyTitle?: string;
  readonly onRename: (title: string) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRename = async () => {
    const next = title.trim();
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(next);
      setRenameOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-base font-semibold tracking-tight text-zinc-50">
            {session.title}
          </h2>
          <p className="text-xs text-zinc-500">
            {storyTitle ?? session.templateId}
            {" · "}
            {COPY.sessions.updated} {formatUpdatedAt(session.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => {
            setTitle(session.title);
            setRenameOpen(true);
          }}>
            {COPY.sessions.rename}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            {COPY.sessions.delete}
          </Button>
          <Link
            to={`/play/${session.sessionId}`}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-orange-500 px-3 text-xs font-medium text-white transition hover:bg-orange-400"
          >
            {COPY.sessions.continue}
          </Link>
        </div>
      </Card>

      <Modal
        open={renameOpen}
        title={COPY.sessions.rename}
        onClose={() => !busy && setRenameOpen(false)}
      >
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            autoFocus
          />
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setRenameOpen(false)}
            >
              {COPY.common.cancel}
            </Button>
            <Button
              size="sm"
              loading={busy}
              onClick={() => void submitRename()}
            >
              {busy ? COPY.sessions.renaming : COPY.common.save}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title={COPY.sessions.delete}
        onClose={() => !busy && setDeleteOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-zinc-400">
            {COPY.sessions.deleteConfirm}
          </p>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
            >
              {COPY.common.cancel}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={() => void submitDelete()}
            >
              {busy ? COPY.sessions.deleting : COPY.sessions.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
