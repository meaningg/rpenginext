/**
 * Shared product chrome metrics + paint.
 *
 * Solid elevated fill only — no opacity/blur. Translucent headers pick up
 * different backdrops (sidebar vs main) and look like mismatched panels.
 */
export const CHROME_SURFACE = "bg-bg-elevated";

export const CHROME_HEADER_CLASS = [
  "flex h-14 shrink-0 items-center",
  "border-b border-border",
  CHROME_SURFACE,
].join(" ");

export const CHROME_PANEL_CLASS = CHROME_SURFACE;

export const CHROME_FOOTER_CLASS = [
  "shrink-0 border-t border-border",
  CHROME_SURFACE,
].join(" ");
