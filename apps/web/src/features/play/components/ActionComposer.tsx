import type { KeyboardEvent, RefObject } from "react";

import { COPY } from "../../../shared/config/copy.ts";
import { Button } from "../../../shared/ui/index.ts";

/**
 * Sticky free-text action composer.
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
    <div className="shrink-0 border-t border-white/6 bg-[#0a0a0c]/92 px-3 py-3 backdrop-blur-md sm:px-6 sm:py-4">
      <div className="mx-auto flex max-w-160 items-end gap-2 rounded-2xl border border-white/8 bg-white/3 p-2 transition focus-within:border-orange-400/35 focus-within:ring-2 focus-within:ring-orange-500/15">
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
          className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 font-sans text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-50"
        />
        <Button
          size="icon"
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
          aria-label={COPY.play.send}
          className="mb-0.5"
        >
          <SendIcon />
        </Button>
      </div>
      <p className="mx-auto mt-2 max-w-2xl px-1 text-[11px] text-zinc-600">
        {COPY.play.composerHint}
      </p>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.5 12h15m0 0-6.75-6.75M19.5 12l-6.75 6.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
