import { X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Button,
  cn,
  Input,
  ScrollArea,
} from "../../../design-system/index.ts";
import { COPY } from "../../../shared/config/copy.ts";
import type { ChatMessage } from "../../../shared/lib/chat-transcript.ts";
import { formatClock } from "../../../shared/lib/format.ts";
import {
  CHROME_HEADER_CLASS,
  CHROME_PANEL_CLASS,
} from "../../../widgets/app-shell/chrome.ts";
import type { CharacterProfile } from "../../../entities/session/model.ts";
import { CharacterCard } from "./CharacterCard.tsx";

/** Right-side play inspector tabs. */
export type InspectorTab = "dialogue" | "character";

/**
 * Right-side inspector: dialogue archive + live character profile tabs.
 * Same elevated material as the product sidebar.
 */
export function PlayInspector({
  messages,
  character,
  open,
  tab,
  onTabChange,
  onClose,
  onJump,
  className,
}: {
  readonly messages: readonly ChatMessage[];
  readonly character: CharacterProfile | null;
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly onTabChange: (tab: InspectorTab) => void;
  readonly onClose: () => void;
  readonly onJump: (id: string) => void;
  readonly className?: string;
}) {
  if (!open) return null;

  return (
    <aside
      className={cn(
        CHROME_PANEL_CLASS,
        "flex h-full min-h-0 w-full flex-col border-border",
        className,
      )}
    >
      <div className={cn(CHROME_HEADER_CLASS, "justify-between gap-2 px-3")}>
        <div
          className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
          role="tablist"
          aria-label={COPY.play.inspector}
        >
          <TabButton
            active={tab === "dialogue"}
            onClick={() => onTabChange("dialogue")}
            label={COPY.play.dialogue}
            count={messages.length}
          />
          <TabButton
            active={tab === "character"}
            onClick={() => onTabChange("character")}
            label={COPY.character.tab}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={COPY.play.closePanel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {tab === "dialogue" ? (
        <DialogueTab messages={messages} onJump={onJump} />
      ) : (
        <CharacterCard profile={character} />
      )}
    </aside>
  );
}

/**
 * Inspector tab button with active state.
 */
function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly label: string;
  readonly count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition",
        active
          ? "bg-accent-muted text-accent"
          : "text-fg-subtle hover:bg-white/[0.04] hover:text-fg",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className="font-mono text-[10px] text-fg-subtle">{count}</span>
      ) : null}
    </button>
  );
}

/**
 * Dialogue archive tab: search + jump list.
 */
function DialogueTab({
  messages,
  onJump,
}: {
  readonly messages: readonly ChatMessage[];
  readonly onJump: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, query]);

  return (
    <>
      <div className="border-b border-border px-3 py-2.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={COPY.play.dialogueSearch}
          aria-label={COPY.play.dialogueSearch}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-fg-faint">
              {COPY.play.dialogueEmpty}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => onJump(message.id)}
                    className="w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-border hover:bg-bg-surface"
                    title={COPY.play.jumpTo}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-medium uppercase tracking-[0.12em]",
                          message.role === "user"
                            ? "text-accent/85"
                            : "text-fg-subtle",
                        )}
                      >
                        {message.role === "user"
                          ? COPY.play.you
                          : COPY.play.narrator}
                        {message.streaming ? ` · ${COPY.play.writing}` : ""}
                      </span>
                      <span className="font-mono text-[10px] text-fg-faint">
                        {formatClock(message.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-fg-muted">
                      {message.content || "…"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </>
  );
}