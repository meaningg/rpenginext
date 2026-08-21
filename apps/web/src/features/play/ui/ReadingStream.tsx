import type { RefObject } from "react";

import type { CSSProperties } from "react";

import { COPY } from "../../../shared/config/copy.ts";
import type { ChatMessage } from "../../../shared/lib/chat-transcript.ts";
import {
  readingSizeRem,
  type ReadingSize,
} from "../../../shared/lib/reading-prefs.ts";
import { PlayEmptyState } from "./PlayEmptyState.tsx";
import { ReadingTurn } from "./ReadingTurn.tsx";

/**
 * Scrollable immersive reading column.
 */
export function ReadingStream({
  messages,
  hydrated,
  showTyping,
  stageHint,
  highlightId,
  readingSize,
  scrollerRef,
  onScroll,
  onPickExample,
  examplesDisabled,
}: {
  readonly messages: readonly ChatMessage[];
  readonly hydrated: boolean;
  readonly showTyping: boolean;
  readonly stageHint: string | null;
  readonly highlightId: string | null;
  readonly readingSize: ReadingSize;
  readonly scrollerRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: () => void;
  readonly onPickExample: (example: string) => void;
  readonly examplesDisabled?: boolean;
}) {
  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto"
    >
      <div
        className="mx-auto w-full max-w-[var(--read-max)] space-y-8 px-4 py-6 sm:px-8 sm:py-9 lg:px-10"
        style={
          {
            "--read-size": readingSizeRem(readingSize),
          } as CSSProperties
        }
      >
        {!hydrated ? (
          <p className="py-16 text-center text-sm text-fg-subtle">
            {COPY.play.loading}
          </p>
        ) : messages.length === 0 && !showTyping ? (
          <PlayEmptyState
            onPickExample={onPickExample}
            disabled={examplesDisabled}
          />
        ) : (
          messages.map((message) => (
            <ReadingTurn
              key={message.id}
              message={message}
              highlighted={highlightId === message.id}
            />
          ))
        )}

        {showTyping ? (
          <div className="flex w-full justify-start">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-bg-surface px-3.5 py-2 text-sm text-fg-muted shadow-surface">
              <span className="inline-flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot animation-delay-150" />
                <span className="typing-dot animation-delay-300" />
              </span>
              <span>{stageHint ?? COPY.stages.writing}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
