import {
  ArrowLeft,
  PanelRight,
  Save,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button, cn, Separator } from "../../../design-system/index.ts";
import { COPY } from "../../../shared/config/copy.ts";
import type { ReadingSize } from "../../../shared/lib/reading-prefs.ts";
import { CHROME_HEADER_CLASS } from "../../../widgets/app-shell/chrome.ts";

/**
 * Play chrome — same height/materials as product sidebar header.
 */
export function PlayTopBar({
  title,
  stageHint,
  busy,
  panelOpen,
  onTogglePanel,
  saving,
  readingSize,
  onReadingSizeChange,
  onSave,
}: {
  readonly title: string;
  readonly stageHint: string | null;
  readonly busy: boolean;
  readonly panelOpen: boolean;
  readonly onTogglePanel: () => void;
  readonly saving: boolean;
  readonly readingSize: ReadingSize;
  readonly onReadingSizeChange: (size: ReadingSize) => void;
  readonly onSave: () => void;
}) {
  return (
    <header
      className={cn(
        CHROME_HEADER_CLASS,
        "justify-between gap-3 overflow-hidden px-3 sm:px-5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button asChild variant="ghost" size="sm" className="shrink-0 px-2">
          <Link to="/sessions">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{COPY.play.back}</span>
          </Link>
        </Button>

        <Separator orientation="vertical" className="hidden h-5 sm:block" />

        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium tracking-tight text-fg">
            {title}
          </h1>
          {busy || stageHint ? (
            <p className="truncate text-[11px] text-accent/90">
              {stageHint ?? COPY.stages.thinking}
            </p>
          ) : (
            <p className="truncate text-[11px] text-fg-faint">
              {COPY.play.modeHint}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div
          className="mr-0.5 hidden items-center rounded-lg border border-border p-0.5 sm:flex"
          role="group"
          aria-label={COPY.play.readingSize}
        >
          {(
            [
              ["sm", COPY.play.readingSizeSm],
              ["md", COPY.play.readingSizeMd],
              ["lg", COPY.play.readingSizeLg],
            ] as const
          ).map(([size, label]) => (
            <button
              key={size}
              type="button"
              onClick={() => onReadingSizeChange(size)}
              aria-pressed={readingSize === size}
              className={cn(
                "h-7 min-w-7 rounded-md px-1.5 text-[11px] font-medium transition",
                readingSize === size
                  ? "bg-accent-muted text-accent"
                  : "text-fg-subtle hover:bg-white/[0.04] hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          variant={panelOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={onTogglePanel}
          aria-pressed={panelOpen}
          aria-label={
            panelOpen ? COPY.play.closePanel : COPY.play.panel
          }
          className={cn(panelOpen && "border-accent/25 bg-accent-muted")}
        >
          <PanelRight className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{COPY.play.panel}</span>
        </Button>
        <Button variant="secondary" size="sm" loading={saving} onClick={onSave}>
          <Save className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{COPY.play.save}</span>
        </Button>
      </div>
    </header>
  );
}
