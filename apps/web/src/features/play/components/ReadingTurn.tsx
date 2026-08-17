import type { ChatMessage } from "../../../shared/lib/chat-transcript.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { splitNarrativeParagraphs } from "../lib/passage.ts";

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
          "mx-auto w-full max-w-[42rem] rounded-xl px-1 py-1 transition-colors",
          highlighted && "message-highlight",
        )}
      >
        <div className="flex items-baseline justify-end gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
            {COPY.play.you}
          </span>
        </div>
        <p className="player-action mt-1 text-right whitespace-pre-wrap text-zinc-300">
          {message.content}
        </p>
      </div>
    );
  }

  const paragraphs = splitNarrativeParagraphs(message.content);

  return (
    <article
      id={`turn-${message.id}`}
      className={cn(
        "mx-auto w-full max-w-[42rem] rounded-xl px-1 py-1 transition-colors",
        highlighted && "message-highlight",
      )}
    >
      <div className="mb-2.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
        <span className="inline-block h-1 w-1 rounded-full bg-orange-400/80" />
        {COPY.play.narrator}
        {message.streaming ? (
          <span className="normal-case tracking-normal text-zinc-500">
            {COPY.play.writing}
          </span>
        ) : null}
      </div>
      <div className="narrative-prose">
        {paragraphs.map((paragraph, index) => {
          const isLast = index === paragraphs.length - 1;
          return (
            <p key={`${message.id}-p-${index}`}>
              {paragraph}
              {message.streaming && isLast ? (
                <span className="stream-cursor" aria-hidden />
              ) : null}
            </p>
          );
        })}
        {message.streaming && paragraphs.length === 0 ? (
          <p>
            <span className="stream-cursor" aria-hidden />
          </p>
        ) : null}
      </div>
    </article>
  );
}
