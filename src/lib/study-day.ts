import { format, subDays } from "date-fns";

export const STUDY_DAY_CUTOFF_HOUR = 2;
export const IST_TIME_ZONE = "Asia/Kolkata";

type ISTParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Read a Date in Indian Standard Time,
 * regardless of Vercel/server timezone.
 */
export function getISTParts(
  now = new Date(),
): ISTParts {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: IST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "short",
      },
    ).formatToParts(now);

  const value = (
    type: Intl.DateTimeFormatPartTypes,
  ) =>
    parts.find(
      (part) => part.type === type,
    )?.value ?? "";

  const weekdayText =
    value("weekday");

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday:
      WEEKDAY_MAP[weekdayText] ?? 0,
  };
}

function ymdFromParts(
  parts: Pick<
    ISTParts,
    "year" | "month" | "day"
  >,
): string {
  return `${parts.year}-${String(
    parts.month,
  ).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

/**
 * Logical JEEFlow study day.
 *
 * 4 Oct 11:30 PM IST -> 4 Oct
 * 5 Oct 1:30 AM IST  -> 4 Oct
 * 5 Oct 2:00 AM IST  -> 5 Oct
 */
export function getStudyDate(
  now = new Date(),
): string {
  const ist =
    getISTParts(now);

  const today =
    ymdFromParts(ist);

  if (
    ist.hour >=
    STUDY_DAY_CUTOFF_HOUR
  ) {
    return today;
  }

  // Date-only operation, so UTC is safe here.
  return format(
    subDays(
      new Date(
        `${today}T12:00:00Z`,
      ),
      1,
    ),
    "yyyy-MM-dd",
  );
}

export function timeToMinutes(
  time: string,
): number {
  const [hour, minute] =
    time.split(":").map(Number);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return 0;
  }

  return (
    hour * 60 +
    minute
  );
}

/**
 * Current clock time in IST,
 * represented as minutes after midnight.
 */
export function currentISTMinutes(
  now = new Date(),
): number {
  const ist =
    getISTParts(now);

  return (
    ist.hour * 60 +
    ist.minute
  );
}

/**
 * Remaining minutes in ONE availability
 * window, based on current IST time.
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
    currentISTMinutes(now);

  // Standard same-day window.
  if (end > start) {
    return Math.max(
      0,
      end -
        Math.max(
          start,
          current,
        ),
    );
  }

  // Overnight availability,
  // e.g. 20:00 -> 01:30.
  const extendedEnd =
    end + 24 * 60;

  let extendedCurrent =
    current;

  if (current < end) {
    extendedCurrent +=
      24 * 60;
  }

  return Math.max(
    0,
    extendedEnd -
      Math.max(
        start,
        extendedCurrent,
      ),
  );
}

export function applyStudyBuffer(
  minutes: number,
  bufferPercent = 15,
): number {
  const percent =
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
          percent / 100),
    ),
  );
}
