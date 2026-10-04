import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildAvailabilityWindows } from "@/lib/data/plan-context";
import {
  applyStudyBuffer,
  getISTParts,
  getRemainingWindowMinutes,
  getStudyDate,
} from "@/lib/study-day";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  const now = new Date();

  const ist = getISTParts(now);
  const studyDate = getStudyDate(now);

  const windows =
    await buildAvailabilityWindows(
      session.userId,
    );

  /*
   * Before 2 AM, we're still treating this
   * as yesterday's study session.
   *
   * Overnight windows from the previous day
   * are therefore relevant.
   */
  const currentWeekday = ist.weekday;

  const previousWeekday =
    (currentWeekday + 6) % 7;

  let relevantWindows;

  if (ist.hour < 2) {
    relevantWindows = windows.filter(
      (window) => {
        /*
         * Previous day's overnight window,
         * e.g. 20:00 -> 01:30.
         */
        if (
          window.dayOfWeek !==
          previousWeekday
        ) {
          return false;
        }

        const [startHour, startMinute] =
          window.startTime
            .split(":")
            .map(Number);

        const [endHour, endMinute] =
          window.endTime
            .split(":")
            .map(Number);

        const start =
          startHour * 60 +
          startMinute;

        const end =
          endHour * 60 +
          endMinute;

        return end < start;
      },
    );
  } else {
    relevantWindows = windows.filter(
      (window) =>
        window.dayOfWeek ===
        currentWeekday,
    );
  }

  const windowResults =
    relevantWindows.map(
      (window) => {
        const remainingMinutes =
          getRemainingWindowMinutes({
            startTime:
              window.startTime,
            endTime:
              window.endTime,
            now,
          });

        return {
          ...window,
          remainingMinutes,
        };
      },
    );

  /*
   * If windows overlap, simple summing can
   * over-count them. For now availability UI
   * normally stores non-overlapping windows,
   * so this is sufficient. We'll normalise
   * overlaps when the today engine is wired.
   */
  const rawRemainingMinutes =
    windowResults.reduce(
      (sum, window) =>
        sum +
        window.remainingMinutes,
      0,
    );

  const schedulableMinutes =
    applyStudyBuffer(
      rawRemainingMinutes,
      15,
    );

  return NextResponse.json({
    studyDate,

    cutoffHour: 2,

    currentIST: {
      year: ist.year,
      month: ist.month,
      day: ist.day,
      hour: ist.hour,
      minute: ist.minute,
      weekday: ist.weekday,
    },

    windows: windowResults,

    rawRemainingMinutes,

    schedulableMinutes,

    bufferPercent: 15,
  });
}
