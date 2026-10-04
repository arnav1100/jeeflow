/** Today's date as yyyy-mm-dd in Indian Standard Time (the app is built for JEE students in India). */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Parse a yyyy-mm-dd string as a calendar date without any timezone shifting. */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((parseYmd(toYmd).getTime() - parseYmd(fromYmd).getTime()) / 86400000);
}

export function formatDayLabel(ymd: string, opts?: { weekday?: "short" | "long" }): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: opts?.weekday ?? "short",
    day: "numeric",
    month: "short",
  }).format(parseYmd(ymd));
}
