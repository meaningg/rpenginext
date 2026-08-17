import type { RefObject } from "react";

import type { ChatMessage } from "../../../shared/lib/chat-transcript.ts";
import { COPY } from "../../../shared/config/copy.ts";
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
  scrollerRef,
  onScroll,
}: {
  readonly messages: readonly ChatMessage[];
  readonly hydrated: boolean;
  readonly showTyping: boolean;
  readonly stageHint: string | null;
  readonly highlightId: string | null;
  readonly scrollerRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: () => void;
}) {
  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className="flex-1 space-y-8 overflow-y-auto px-4 py-6 sm:px-8 sm:py-9"
    >
      {!hydrated ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          {COPY.play.loading}
        </p>
      ) : messages.length === 0 && !showTyping ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-1.5 py-20 text-center">
          <p className="text-sm text-zinc-300">{COPY.play.emptyTitle}</p>
          <p className="text-xs text-zinc-600">{COPY.play.emptyBody}</p>
        </div>
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
        <div className="mx-auto flex w-full max-w-160 justify-start">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/6 bg-white/3 px-3.5 py-2 text-sm text-zinc-400">
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
  );
}
