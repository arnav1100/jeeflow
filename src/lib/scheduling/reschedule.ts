import { addDays, format, nextSunday, parseISO } from "date-fns";

export type RescheduleOption = "auto" | "backlog" | "sunday" | "custom_date" | "skip";

export interface ExistingTaskLite {
  scheduledDate: string;
  estimatedMinutes: number;
}

/**
 * Finds the next date with enough free capacity for `minutesNeeded`, starting
 * from `fromDateExclusive`. Capacity for a day = availability for that weekday
 * minus minutes already scheduled (from `existingTasksByDate`).
 */
export function findNextAvailableSlot(opts: {
  fromDateExclusive: string;
  minutesNeeded: number;
  availabilityMinutesByWeekday: Record<number, number>;
  existingTasksByDate: Record<string, number>; // date -> minutes already scheduled
  searchLimitDays?: number;
}): string {
  const { fromDateExclusive, minutesNeeded, availabilityMinutesByWeekday, existingTasksByDate } = opts;
  const limit = opts.searchLimitDays ?? 30;

  for (let i = 1; i <= limit; i++) {
    const date = addDays(parseISO(fromDateExclusive), i);
    const weekday = date.getDay();
    const dateStr = format(date, "yyyy-MM-dd");
    const capacity = availabilityMinutesByWeekday[weekday] ?? 0;
    const used = existingTasksByDate[dateStr] ?? 0;
    if (capacity - used >= minutesNeeded) {
      return dateStr;
    }
  }
  // Fall back to the day right after the search window — better to slightly
  // overload one day than to silently drop the task.
  return format(addDays(parseISO(fromDateExclusive), limit + 1), "yyyy-MM-dd");
}

export function resolveRescheduleDate(
  option: RescheduleOption,
  opts: {
    fromDateExclusive: string;
    minutesNeeded: number;
    availabilityMinutesByWeekday: Record<number, number>;
    existingTasksByDate: Record<string, number>;
    customDate?: string;
  },
): string | null {
  switch (option) {
    case "auto":
      return findNextAvailableSlot(opts);
    case "sunday":
      return format(nextSunday(parseISO(opts.fromDateExclusive)), "yyyy-MM-dd");
    case "custom_date":
      return opts.customDate ?? null;
    case "backlog":
    case "skip":
    default:
      return null;
  }
}
