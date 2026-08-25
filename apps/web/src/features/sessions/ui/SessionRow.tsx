import {
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorState,
  Input,
  Surface,
} from "../../../design-system/index.ts";
import type { SessionSummary } from "../../../entities/session/model.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { toUserMessage } from "../../../shared/lib/errors.ts";
import { formatUpdatedAt } from "../../../shared/lib/format.ts";
import { getSessionPreview } from "../../../shared/lib/session-preview.ts";

/**
 * Dense session list row with preview + actions menu.
 */
export function SessionRow({
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

  const preview = useMemo(
    () => getSessionPreview(session.sessionId),
    [session.sessionId, session.updatedAt],
  );

  const submitRename = async () => {
    const next = title.trim();
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(next);
      setRenameOpen(false);
    } catch (err) {
      setError(toUserMessage(err));
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
      setError(toUserMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Surface className="group flex items-stretch gap-3 px-3 py-2.5 transition hover:border-border-strong sm:px-3.5">
        <Link
          to={`/play/${session.sessionId}`}
          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-medium tracking-tight text-fg group-hover:text-white">
              {session.title}
            </h2>
            <span className="hidden shrink-0 font-mono text-[10px] text-fg-faint sm:inline">
              {formatUpdatedAt(session.updatedAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-subtle">
            {storyTitle ?? session.templateId}
            <span className="text-fg-faint sm:hidden">
              {" · "}
              {formatUpdatedAt(session.updatedAt)}
            </span>
          </p>
          <p className="mt-1 line-clamp-1 text-[12px] leading-snug text-fg-faint">
            {preview ?? COPY.sessions.noPreview}
          </p>
        </Link>

        <div className="flex shrink-0 items-center gap-1 self-center">
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link to={`/play/${session.sessionId}`}>
              <Play className="h-3.5 w-3.5" />
              {COPY.sessions.continue}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={COPY.sessions.actions}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/play/${session.sessionId}`}>
                  <Play className="h-3.5 w-3.5" />
                  {COPY.sessions.continue}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setTitle(session.title);
                  setError(null);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                {COPY.sessions.rename}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                danger
                onSelect={() => {
                  setError(null);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {COPY.sessions.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Surface>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => !busy && setRenameOpen(open)}
        title={COPY.sessions.rename}
      >
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            autoFocus
          />
          {error ? <ErrorState message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setRenameOpen(false)}
            >
              {COPY.common.cancel}
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitRename()}>
              {busy ? COPY.sessions.renaming : COPY.common.save}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => !busy && setDeleteOpen(open)}
        title={COPY.sessions.delete}
        description={COPY.sessions.deleteConfirm}
      >
        <div className="space-y-4">
          {error ? <ErrorState message={error} /> : null}
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
      </Dialog>
    </>
  );
}
