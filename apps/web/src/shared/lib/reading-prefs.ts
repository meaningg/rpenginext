export type ReadingSize = "sm" | "md" | "lg";

const KEY = "rp.ui.readingSize";

const SIZES: readonly ReadingSize[] = ["sm", "md", "lg"];

/**
 * Loads reading size preference.
 */
export function loadReadingSize(): ReadingSize {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && (SIZES as readonly string[]).includes(raw)) {
      return raw as ReadingSize;
    }
  } catch {
    /* ignore */
  }
  return "md";
}

/**
 * Persists reading size preference.
 *
 * @param size - reading density
 */
export function saveReadingSize(size: ReadingSize): void {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    /* ignore */
  }
}

/**
 * Rem size for narrative column CSS variable.
 *
 * @param size - reading density
 */
export function readingSizeRem(size: ReadingSize): string {
  switch (size) {
    case "sm":
      return "1.05rem";
    case "lg":
      return "1.3rem";
    default:
      return "1.18rem";
  }
}
