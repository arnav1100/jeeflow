import { format, subDays } from "date-fns";

export const STUDY_DAY_CUTOFF_HOUR = 2;

/**
 * Returns the logical study date.
 *
 * Example:
 * 4 Oct 11:30 PM -> 4 Oct
 * 5 Oct 1:30 AM  -> 4 Oct
 * 5 Oct 2:00 AM  -> 5 Oct
 */
export function getStudyDate(
  now = new Date(),
): string {
  const shifted =
    now.getHours() <
    STUDY_DAY_CUTOFF_HOUR
      ? subDays(now, 1)
      : now;

  return format(
    shifted,
    "yyyy-MM-dd",
  );
}

/**
 * Converts HH:mm -> minutes since midnight.
 *
 * 17:30 -> 1050
 */
export function timeToMinutes(
  time: string,
): number {
  const [hours, minutes] =
    time.split(":").map(Number);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return 0;
  }

  return hours * 60 + minutes;
}

/**
 * Minutes since midnight for a Date.
 */
export function currentMinutes(
  now = new Date(),
): number {
  return (
    now.getHours() * 60 +
    now.getMinutes()
  );
}

/**
 * Calculates how much study time is ACTUALLY
 * still available in a study window today.
 *
 * Examples:
 *
 * Window: 4 PM -> 11 PM
 *
 * Current time = 2 PM
 * Result = 7h
 *
 * Current time = 5 PM
 * Result = 6h
 *
 * Current time = 10:30 PM
 * Result = 30m
 *
 * Current time = 11:30 PM
 * Result = 0
 */
export function getRemainingWindowMinutes({
  startTime,
  endTime,
  now = new Date(),
}: {
  startTime: string;
  endTime: string;
  now?: Date;
}): number {
  const start =
    timeToMinutes(startTime);

  const end =
    timeToMinutes(endTime);

  const current =
    currentMinutes(now);

  /*
   * Standard same-day window:
   * 16:00 -> 23:00
   */
  if (end > start) {
    const effectiveStart =
      Math.max(
        start,
        current,
      );

    return Math.max(
      0,
      end -
        effectiveStart,
    );
  }

  /*
   * Overnight window:
   * 20:00 -> 01:00
   *
   * Treat end as next day.
   */
  const endNextDay =
    end + 24 * 60;

  let effectiveCurrent =
    current;

  if (current < end) {
    effectiveCurrent +=
      24 * 60;
  }

  const effectiveStart =
    Math.max(
      start,
      effectiveCurrent,
    );

  return Math.max(
    0,
    endNextDay -
      effectiveStart,
  );
}

/**
 * Keep some breathing room.
 *
 * Example:
 * 300 minutes remaining
 * 15% buffer
 * -> 255 minutes schedulable
 */
export function applyStudyBuffer(
  minutes: number,
  bufferPercent = 15,
): number {
  const safePercent =
    Math.max(
      0,
      Math.min(
        50,
        bufferPercent,
      ),
    );

  return Math.max(
    0,
    Math.floor(
      minutes *
        (1 -
          safePercent /
            100),
    ),
  );
}
