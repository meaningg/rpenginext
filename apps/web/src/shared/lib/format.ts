const RU_RELATIVE = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

const RU_DATE = new Intl.DateTimeFormat("ru", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const RU_TIME = new Intl.DateTimeFormat("ru", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formats an ISO timestamp for session lists (relative when recent).
 *
 * @param iso - ISO date string
 */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < hour) {
    return RU_RELATIVE.format(Math.round(diffMs / minute), "minute");
  }
  if (absMs < day) {
    return RU_RELATIVE.format(Math.round(diffMs / hour), "hour");
  }
  if (absMs < 7 * day) {
    return RU_RELATIVE.format(Math.round(diffMs / day), "day");
  }
  return RU_DATE.format(date);
}

/**
 * Short clock time for dialogue items.
 *
 * @param iso - ISO date string
 */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return RU_TIME.format(date);
}
