import { useState } from "react";
import { useParams } from "react-router-dom";

import { ActionComposer } from "../features/play/components/ActionComposer.tsx";
import { DialoguePanel } from "../features/play/components/DialoguePanel.tsx";
import { PlayTopBar } from "../features/play/components/PlayTopBar.tsx";
import { ReadingStream } from "../features/play/components/ReadingStream.tsx";
import { useSessionPlay } from "../features/play/hooks/useSessionPlay.ts";
import { useSmartScroll } from "../features/play/hooks/useSmartScroll.ts";
import { PlayLayout } from "../layouts/PlayLayout.tsx";
import { COPY } from "../shared/config/copy.ts";
import { cn } from "../shared/lib/cn.ts";
import { ErrorBanner, useToast } from "../shared/ui/index.ts";

/**
 * Immersive play route: reading stream + dialogue archive.
 */
export function PlayPage() {
  const { sessionId = "" } = useParams();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const play = useSessionPlay(sessionId);
  const { scrollerRef, onScroll } = useSmartScroll<HTMLDivElement>([
    play.messages,
    play.busy,
    play.stageHint,
  ]);

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await play.save();
      if (saved) {
        toast.push(`${COPY.play.saved} · rev ${saved.revision}`, "success");
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlayLayout>
      <PlayTopBar
        title={play.session?.title ?? COPY.common.loading}
        stageHint={play.stageHint}
        busy={play.busy}
        dialogueOpen={play.dialogueOpen}
        dialogueCount={play.messages.length}
        saving={saving}
        onToggleDialogue={() => play.setDialogueOpen(!play.dialogueOpen)}
        onSave={() => void onSave()}
      />

      {play.error ? (
        <div className="px-3 pt-3 sm:px-5">
          <ErrorBanner message={play.error} />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <ReadingStream
            messages={play.messages}
            hydrated={play.hydrated}
            showTyping={play.showTyping}
            stageHint={play.stageHint}
            highlightId={play.highlightId}
            scrollerRef={scrollerRef}
            onScroll={onScroll}
          />
          <ActionComposer
            value={play.text}
            onChange={play.setText}
            onSubmit={() => void play.submit()}
            onKeyDown={play.onComposerKeyDown}
            disabled={play.busy || !play.hydrated}
            inputRef={play.inputRef}
          />
        </section>

        {/* Desktop side panel */}
        <div
          className={cn(
            "hidden min-h-0 border-l border-white/[0.06] transition-[width] duration-200 xl:block",
            play.dialogueOpen ? "w-[22rem]" : "w-0 overflow-hidden border-l-0",
          )}
        >
          <DialoguePanel
            messages={play.messages}
            open={play.dialogueOpen}
            onClose={() => play.setDialogueOpen(false)}
            onJump={play.focusMessage}
            className="h-full"
          />
        </div>
      </div>

      {/* Mobile / tablet drawer */}
      {play.dialogueOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={COPY.common.close}
            onClick={() => play.setDialogueOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(100%,22rem)] border-l border-white/[0.08] shadow-2xl shadow-black/50">
            <DialoguePanel
              messages={play.messages}
              open
              onClose={() => play.setDialogueOpen(false)}
              onJump={(id) => {
                play.focusMessage(id);
                play.setDialogueOpen(false);
              }}
              className="h-full"
            />
          </div>
        </div>
      ) : null}
    </PlayLayout>
  );
}
