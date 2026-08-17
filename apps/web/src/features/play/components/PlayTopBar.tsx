import { Link } from "react-router-dom";

import { COPY } from "../../../shared/config/copy.ts";
import { Button } from "../../../shared/ui/index.ts";

/**
 * Compact chrome for play mode.
 */
export function PlayTopBar({
  title,
  stageHint,
  busy,
  dialogueOpen,
  dialogueCount,
  saving,
  onToggleDialogue,
  onSave,
}: {
  readonly title: string;
  readonly stageHint: string | null;
  readonly busy: boolean;
  readonly dialogueOpen: boolean;
  readonly dialogueCount: number;
  readonly saving: boolean;
  readonly onToggleDialogue: () => void;
  readonly onSave: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to="/sessions"
          className="shrink-0 text-sm text-zinc-500 transition hover:text-zinc-200"
        >
          ← {COPY.play.back}
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium tracking-tight text-zinc-100 sm:text-[15px]">
            {title}
          </h1>
          {busy || stageHint ? (
            <p className="truncate text-[11px] text-orange-300/85">
              {stageHint ?? COPY.stages.thinking}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="soft"
          size="sm"
          onClick={onToggleDialogue}
          aria-pressed={dialogueOpen}
        >
          {COPY.play.dialogue}
          <span className="text-zinc-500">{dialogueCount}</span>
        </Button>
        <Button
          variant="soft"
          size="sm"
          loading={saving}
          onClick={onSave}
        >
          {COPY.play.save}
        </Button>
      </div>
    </header>
  );
}
