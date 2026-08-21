import { ArrowUp } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

import { Button, Kbd } from "../../../design-system/index.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { CHROME_FOOTER_CLASS } from "../../../widgets/app-shell/chrome.ts";

/**
 * Sticky free-text action composer — aligned with product surfaces.
 */
export function ActionComposer({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled,
  inputRef,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly disabled: boolean;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className={`${CHROME_FOOTER_CLASS} px-3 py-3 sm:px-6 sm:py-4`}>
      <div className="mx-auto flex w-full max-w-[var(--read-max)] items-end gap-2 rounded-xl border border-border bg-bg-surface p-2 shadow-surface transition focus-within:border-accent/35 focus-within:ring-2 focus-within:ring-accent-ring">
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          onChange={(e) => {
            onChange(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={COPY.play.placeholder}
          aria-label={COPY.play.placeholder}
          className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-3 py-2.5 font-sans text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button
          size="icon"
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
          aria-label={COPY.play.send}
          className="mb-0.5"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <p className="mx-auto mt-2.5 flex w-full max-w-[var(--read-max)] flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-[11px] text-fg-faint">
        <Kbd>Enter</Kbd>
        <span className="text-fg-faint/70">/</span>
        <Kbd>⌘</Kbd>
        <Kbd>↵</Kbd>
        <span>{COPY.play.sendShort}</span>
        <span className="text-fg-faint/50">·</span>
        <Kbd>⇧</Kbd>
        <Kbd>Enter</Kbd>
        <span>{COPY.play.newlineShort}</span>
        <span className="text-fg-faint/50">·</span>
        <Kbd>/</Kbd>
        <span>{COPY.play.focusComposer}</span>
      </p>
    </div>
  );
}
