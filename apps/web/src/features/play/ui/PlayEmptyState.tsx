import { COPY } from "../../../shared/config/copy.ts";

/**
 * Empty play onboarding with example actions.
 */
export function PlayEmptyState({
  onPickExample,
  disabled,
}: {
  readonly onPickExample: (example: string) => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-bg-surface/40 px-5 py-16 text-center">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-fg">{COPY.play.emptyTitle}</p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-fg-subtle">
          {COPY.play.emptyBody}
        </p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
          {COPY.play.emptyExamplesTitle}
        </p>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:justify-center">
          {COPY.play.emptyExamples.map((example) => (
            <button
              key={example}
              type="button"
              disabled={disabled}
              onClick={() => onPickExample(example)}
              className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left text-[13px] text-fg-muted transition hover:border-border-strong hover:bg-bg-muted hover:text-fg disabled:opacity-50 sm:text-center"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
