/**
 * Layout-independent key helpers.
 *
 * Prefer `code` (physical key) over `key` (typed char),
 * so shortcuts work on RU/EN and other layouts.
 */

/** Minimal key event shape (DOM + React synthetic). */
export interface KeyLike {
  readonly code: string;
  readonly key: string;
}

/**
 * True when the physical Slash key was pressed (`/` on QWERTY, `.` on Russian ЙЦУКЕН).
 */
export function isSlashKey(event: KeyLike): boolean {
  return event.code === "Slash" || event.key === "/";
}

/**
 * True when Escape was pressed.
 */
export function isEscapeKey(event: KeyLike): boolean {
  return event.code === "Escape" || event.key === "Escape";
}

/**
 * True when Enter was pressed (main or numpad).
 */
export function isEnterKey(event: KeyLike): boolean {
  return (
    event.code === "Enter" ||
    event.code === "NumpadEnter" ||
    event.key === "Enter"
  );
}

/**
 * True when the event target is a text field the user is typing into.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}
