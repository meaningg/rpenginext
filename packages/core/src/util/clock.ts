/**
 * Injectable clock for deterministic tests.
 */
export interface Clock {
  /**
   * Returns current time as ISO-8601 string.
   */
  nowIso(): string;

  /**
   * Returns monotonic milliseconds (for durations).
   */
  nowMs(): number;
}

/**
 * System clock backed by `Date` / `performance`.
 */
export function createSystemClock(): Clock {
  return {
    nowIso(): string {
      return new Date().toISOString();
    },
    nowMs(): number {
      return performance.now();
    },
  };
}

/**
 * Fixed / steppable clock for tests.
 *
 * @param startIso - initial ISO timestamp
 * @param startMs - initial monotonic ms
 */
export function createFixedClock(
  startIso = "2026-01-01T00:00:00.000Z",
  startMs = 0,
): Clock & { advanceMs(delta: number): void; setIso(iso: string): void } {
  let iso = startIso;
  let ms = startMs;
  return {
    nowIso(): string {
      return iso;
    },
    nowMs(): number {
      return ms;
    },
    advanceMs(delta: number): void {
      ms += delta;
      const date = new Date(iso);
      date.setMilliseconds(date.getMilliseconds() + delta);
      iso = date.toISOString();
    },
    setIso(next: string): void {
      iso = next;
    },
  };
}
