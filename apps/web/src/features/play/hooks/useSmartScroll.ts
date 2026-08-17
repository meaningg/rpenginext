import { useEffect, useRef, type RefObject } from "react";

/**
 * Keeps a scroller pinned to bottom unless the user scrolls up.
 *
 * @param deps - values that change content height
 */
export function useSmartScroll<T extends HTMLElement>(
  deps: readonly unknown[],
): {
  readonly scrollerRef: RefObject<T | null>;
  readonly onScroll: () => void;
} {
  const scrollerRef = useRef<T | null>(null);
  const stickRef = useRef(true);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 80;
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { scrollerRef, onScroll };
}
