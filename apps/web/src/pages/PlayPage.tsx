import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";

import { cn, ErrorState, useToast } from "../design-system/index.ts";
import { usePlayHotkeys } from "../features/play/hooks/usePlayHotkeys.ts";
import { useSessionPlay } from "../features/play/hooks/useSessionPlay.ts";
import { useSmartScroll } from "../features/play/hooks/useSmartScroll.ts";
import { ActionComposer } from "../features/play/ui/ActionComposer.tsx";
import { DialoguePanel } from "../features/play/ui/DialoguePanel.tsx";
import { PlayTopBar } from "../features/play/ui/PlayTopBar.tsx";
import { ReadingStream } from "../features/play/ui/ReadingStream.tsx";
import { COPY } from "../shared/config/copy.ts";
import { toUserMessage } from "../shared/lib/errors.ts";
import {
  loadReadingSize,
  saveReadingSize,
  type ReadingSize,
} from "../shared/lib/reading-prefs.ts";
import { PlayShell } from "../widgets/play-shell/PlayShell.tsx";

/**
 * Immersive play route: reading stream + dialogue archive.
 */
export function PlayPage() {
  const { sessionId = "" } = useParams();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [readingSize, setReadingSize] = useState<ReadingSize>(() =>
    loadReadingSize(),
  );
  const play = useSessionPlay(sessionId);
  const { scrollerRef, onScroll } = useSmartScroll<HTMLDivElement>([
    play.messages,
    play.busy,
    play.stageHint,
    readingSize,
  ]);

  const onReadingSizeChange = useCallback((size: ReadingSize) => {
    setReadingSize(size);
    saveReadingSize(size);
  }, []);

  usePlayHotkeys({
    dialogueOpen: play.dialogueOpen,
    onCloseDialogue: () => play.setDialogueOpen(false),
    onFocusComposer: play.focusComposer,
  });

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await play.save();
      if (saved) {
        toast.push(`${COPY.play.saved} · rev ${saved.revision}`, "success");
      }
    } catch (err) {
      toast.push(toUserMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlayShell>
      <PlayTopBar
        title={play.session?.title ?? COPY.common.loading}
        stageHint={play.stageHint}
        busy={play.busy}
        dialogueOpen={play.dialogueOpen}
        dialogueCount={play.messages.length}
        saving={saving}
        readingSize={readingSize}
        onReadingSizeChange={onReadingSizeChange}
        onToggleDialogue={() => play.setDialogueOpen(!play.dialogueOpen)}
        onSave={() => void onSave()}
      />

      {play.error ? (
        <div className="border-b border-border px-3 py-3 sm:px-5">
          <div className="mx-auto w-full max-w-[var(--read-max)]">
            <ErrorState
              message={play.error}
              action={
                <button
                  type="button"
                  className="text-sm font-medium text-rose-100 underline-offset-4 hover:underline"
                  onClick={() => play.clearError()}
                >
                  {COPY.common.close}
                </button>
              }
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col bg-bg">
          <ReadingStream
            messages={play.messages}
            hydrated={play.hydrated}
            showTyping={play.showTyping}
            stageHint={play.stageHint}
            highlightId={play.highlightId}
            readingSize={readingSize}
            scrollerRef={scrollerRef}
            onScroll={onScroll}
            onPickExample={play.applyExample}
            examplesDisabled={play.busy || !play.hydrated}
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

        <div
          className={cn(
            "hidden min-h-0 border-l border-border transition-[width] duration-200 xl:block",
            play.dialogueOpen
              ? "w-[var(--play-dialogue-width)]"
              : "w-0 overflow-hidden border-l-0",
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

      {play.dialogueOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={COPY.common.close}
            onClick={() => play.setDialogueOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(100%,22rem)] border-l border-border shadow-2xl shadow-black/50">
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
    </PlayShell>
  );
}
