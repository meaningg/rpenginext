import { useEffect } from "react";

import {
  isEditableTarget,
  isEscapeKey,
  isSlashKey,
} from "../../../shared/lib/hotkeys.ts";

/**
 * Global play hotkeys (layout-independent via event.code).
 *
 * - Esc: close dialogue drawer/panel
 * - physical `/` (Slash): focus composer when not already in an input
 */
export function usePlayHotkeys(options: {
  readonly enabled?: boolean;
  readonly dialogueOpen: boolean;
  readonly onCloseDialogue: () => void;
  readonly onFocusComposer: () => void;
}): void {
  const {
    enabled = true,
    dialogueOpen,
    onCloseDialogue,
    onFocusComposer,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (isEscapeKey(event)) {
        if (dialogueOpen) {
          event.preventDefault();
          onCloseDialogue();
        }
        return;
      }

      // Physical Slash key — works on RU layout where the same key types "."
      if (isSlashKey(event) && !isEditableTarget(event.target)) {
        event.preventDefault();
        onFocusComposer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, dialogueOpen, onCloseDialogue, onFocusComposer]);
}
