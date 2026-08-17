import { useMemo, useState } from "react";

import type { ChatMessage } from "../../../shared/lib/chat-transcript.ts";
import { COPY } from "../../../shared/config/copy.ts";
import { formatClock } from "../../../shared/lib/format.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { Button, Input } from "../../../shared/ui/index.ts";

/**
 * Full dialogue archive panel.
 */
export function DialoguePanel({
  messages,
  open,
  onClose,
  onJump,
  className,
}: {
  readonly messages: readonly ChatMessage[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onJump: (id: string) => void;
  readonly className?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, query]);

  if (!open) return null;

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-white/[0.06] bg-[#0d0d11]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">
            {COPY.play.dialogue}
          </p>
          <p className="text-xs text-zinc-500">
            {COPY.play.dialogueCount(messages.length)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={COPY.play.closeDialogue}
        >
          {COPY.common.close}
        </Button>
      </div>

      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={COPY.play.dialogueSearch}
          aria-label={COPY.play.dialogueSearch}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-zinc-600">
            {COPY.play.dialogueEmpty}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => onJump(message.id)}
                  className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
                  title={COPY.play.jumpTo}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-[0.12em]",
                        message.role === "user"
                          ? "text-orange-300/80"
                          : "text-zinc-500",
                      )}
                    >
                      {message.role === "user"
                        ? COPY.play.you
                        : COPY.play.narrator}
                      {message.streaming ? ` · ${COPY.play.writing}` : ""}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {formatClock(message.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-[13px] leading-relaxed text-zinc-300">
                    {message.content || "…"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
