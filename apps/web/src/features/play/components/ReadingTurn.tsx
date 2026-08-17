import type { ChatMessage } from "../../../shared/lib/chat-transcript.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { cn } from "../../../shared/lib/cn.ts";
import {
  parseNarrativeBlocks,
  type NarrativeSpan,
} from "../lib/passage.ts";

/**
 * One turn in the immersive reading stream.
 */
export function ReadingTurn({
  message,
  highlighted,
}: {
  readonly message: ChatMessage;
  readonly highlighted?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div
        id={`turn-${message.id}`}
        className={cn(
          "mx-auto w-full max-w-160 rounded-xl px-1 py-1 transition-colors",
          highlighted && "message-highlight",
        )}
      >
        <div className="flex items-baseline justify-end gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
            {COPY.play.you}
          </span>
        </div>
        <p className="player-action mt-1 text-right whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    );
  }

  const blocks = parseNarrativeBlocks(message.content);

  return (
    <article
      id={`turn-${message.id}`}
      lang="ru"
      className={cn(
        "mx-auto w-full max-w-160 rounded-xl px-1 py-1 transition-colors",
        highlighted && "message-highlight",
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
        <span className="inline-block h-1 w-1 rounded-full bg-orange-400/80" />
        {COPY.play.narrator}
        {message.streaming ? (
          <span className="normal-case tracking-normal text-zinc-500">
            {COPY.play.writing}
          </span>
        ) : null}
      </div>
      <div className="narrative-prose">
        {blocks.map((block, index) => {
          const isLast = index === blocks.length - 1;
          return (
            <p
              key={`${message.id}-b-${index}`}
              className={cn(
                "narrative-block",
                block.role === "speech"
                  ? "narrative-block--speech"
                  : "narrative-block--narration",
              )}
            >
              {block.spans.map((span, spanIndex) => (
                <NarrativeSpanView
                  key={`${message.id}-b-${index}-s-${spanIndex}`}
                  span={span}
                />
              ))}
              {message.streaming && isLast ? (
                <span className="stream-cursor" aria-hidden />
              ) : null}
            </p>
          );
        })}
        {message.streaming && blocks.length === 0 ? (
          <p className="narrative-block narrative-block--narration">
            <span className="stream-cursor" aria-hidden />
          </p>
        ) : null}
      </div>
    </article>
  );
}

function NarrativeSpanView({ span }: { readonly span: NarrativeSpan }) {
  if (span.kind === "speech") {
    return <span className="narrative-speech">{span.text}</span>;
  }
  if (span.kind === "emphasis") {
    return <em className="narrative-emphasis">{span.text}</em>;
  }
  return <>{span.text}</>;
}
