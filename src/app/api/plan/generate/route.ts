import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import {
  and,
  eq,
  ne,
} from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { db } from "@/db";

import {
  profiles,
  studyPlans,
  studyTasks,
} from "@/db/schema";

import {
  buildAvailabilityMap,
  buildAvailabilityWindows,
  buildEngineChapters,
} from "@/lib/data/plan-context";

import {
  generateTodayPlan,
} from "@/lib/scheduling/today-engine";

import {
  addDaysYmd,
  daysBetween,
  todayIST,
} from "@/lib/date";

import {
  applyStudyBuffer,
  getISTParts,
  getRemainingWindowMinutes,
} from "@/lib/study-day";

const schema = z.object({
  strategy: z
    .literal("full_syllabus")
    .optional(),

  startDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
    )
    .optional(),

  days: z
    .number()
    .int()
    .min(1)
    .max(365),
});

function weekdayForDate(
  date: string,
): number {
  return new Date(
    `${date}T12:00:00Z`,
  ).getUTCDay();
}

export async function POST(
  req: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Not authenticated.",
      },
      { status: 401 },
    );
  }

  const body =
    await req
      .json()
      .catch(() => ({}));

  const parsed =
    schema.safeParse(
      body,
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid plan settings.",
      },
      { status: 400 },
    );
  }

  const userId =
    session.userId;

  const requestedStartDate =
    parsed.data.startDate ??
    todayIST();

  const days =
    parsed.data.days;

  const endDate =
    addDaysYmd(
      requestedStartDate,
      days - 1,
    );

  /*
   * Load everything once.
   */
  const [
    profileRows,
    chaptersList,
    availabilityMap,
    availabilityWindows,
    oldTasks,
  ] = await Promise.all([
    db
      .select()
      .from(profiles)
      .where(
        eq(
          profiles.userId,
          userId,
        ),
      )
      .limit(1),

    buildEngineChapters(
      userId,
    ),

    buildAvailabilityMap(
      userId,
    ),

    buildAvailabilityWindows(
      userId,
    ),

    db
      .select()
      .from(studyTasks)
      .where(
        eq(
          studyTasks.userId,
          userId,
        ),
      ),
  ]);

  const profile =
    profileRows[0];

  if (!profile) {
    return NextResponse.json(
      {
        error:
          "Complete onboarding first.",
      },
      { status: 400 },
    );
  }

  const weeklyMinutes =
    Object.values(
      availabilityMap,
    ).reduce(
      (sum, value) =>
        sum + value,
      0,
    );

  if (
    weeklyMinutes <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Add your study availability in Profile first.",
      },
      { status: 422 },
    );
  }

  const now =
    new Date();

  const ist =
    getISTParts(now);

  const realToday =
    todayIST();

  /*
   * ============================================
   * FIND ACTIONABLE DATE + AVAILABLE TIME
   * ============================================
   */

  let effectiveDate =
    requestedStartDate;

  let usableMinutes = 0;

  if (
    requestedStartDate ===
    realToday
  ) {
    /*
     * For today we only count time
     * which is ACTUALLY still remaining.
     */
    const todayWindows =
      availabilityWindows.filter(
        (window) =>
          window.dayOfWeek ===
          ist.weekday,
      );

    const rawRemaining =
      todayWindows.reduce(
        (sum, window) =>
          sum +
          getRemainingWindowMinutes({
            startTime:
              window.startTime,

            endTime:
              window.endTime,

            now,
          }),
        0,
      );

    usableMinutes =
      applyStudyBuffer(
        rawRemaining,
        15,
      );

    /*
     * Today's window is over.
     *
     * Find next available day automatically.
     */
    if (
      usableMinutes < 15
    ) {
      let found = false;

      for (
        let offset = 1;
        offset <= 14;
        offset++
      ) {
        const candidateDate =
          addDaysYmd(
            requestedStartDate,
            offset,
          );

        const weekday =
          weekdayForDate(
            candidateDate,
          );

        const rawMinutes =
          availabilityMap[
            weekday
          ] ?? 0;

        if (
          rawMinutes >= 15
        ) {
          effectiveDate =
            candidateDate;

          usableMinutes =
            applyStudyBuffer(
              rawMinutes,
              15,
            );

          found = true;

          break;
        }
      }

      if (!found) {
        return NextResponse.json(
          {
            error:
              "No upcoming study window was found. Update your availability in Profile.",
          },
          { status: 422 },
        );
      }
    }
  } else {
    /*
     * Future study date:
     * use its complete availability.
     */
    const weekday =
      weekdayForDate(
        requestedStartDate,
      );

    usableMinutes =
      applyStudyBuffer(
        availabilityMap[
          weekday
        ] ?? 0,
        15,
      );
  }

  if (
    usableMinutes < 15
  ) {
    return NextResponse.json(
      {
        error:
          "There is not enough study time in the selected study window.",
      },
      { status: 422 },
    );
  }

  /*
   * ============================================
   * MISSED WORK
   * ============================================
   *
   * DailyCheckIn:
   *
   * Did it
   * -> done
   * -> progress updates
   *
   * Didn't do
   * -> skipped
   * -> progress remains pending
   *
   * The chapter receives a priority boost today.
   */

  const missedChapterIds =
    Array.from(
      new Set(
        oldTasks
          .filter(
            (task) =>
              task.status ===
                "skipped" &&
              task.chapterId !==
                null &&
              String(
                task.scheduledDate,
              ) <
                effectiveDate,
          )
          .map(
            (task) =>
              task.chapterId!,
          ),
      ),
    );

  /*
   * ============================================
   * GENERATE EXACTLY ONE DAY
   * ============================================
   */

  const todayResult =
    generateTodayPlan({
      date:
        effectiveDate,

      availableMinutes:
        usableMinutes,

      chapters:
        chaptersList,

      missedChapterIds,
    });

  if (
    todayResult.tasks.length ===
    0
  ) {
    return NextResponse.json(
      {
        error:
          "No pending study tasks were found.",
      },
      { status: 422 },
    );
  }

  /*
   * Final defensive duplicate protection.
   *
   * Same date + same chapter + same task type
   * can appear only once.
   */
  const uniqueTasks =
    Array.from(
      new Map(
        todayResult.tasks.map(
          (task) => [
            `${task.scheduledDate}:${task.chapterId}:${task.taskType}`,
            task,
          ],
        ),
      ).values(),
    );

  const totalDays =
    daysBetween(
      requestedStartDate,
      endDate,
    ) + 1;

  /*
   * ============================================
   * SAVE
   * ============================================
   */

  const plan =
    await db.transaction(
      async (tx) => {
        /*
         * Archive previous active plan.
         */
        await tx
          .update(
            studyPlans,
          )
          .set({
            status:
              "archived",
          })
          .where(
            eq(
              studyPlans.userId,
              userId,
            ),
          );

        /*
         * Keep completed task history.
         *
         * Remove stale unfinished/generated tasks.
         */
        await tx
          .delete(
            studyTasks,
          )
          .where(
            and(
              eq(
                studyTasks.userId,
                userId,
              ),
              ne(
                studyTasks.status,
                "done",
              ),
            ),
          );

        const [created] =
          await tx
            .insert(
              studyPlans,
            )
            .values({
              userId,

              strategy:
                "full_syllabus",

              /*
               * Long-term target countdown.
               */
              startDate:
                requestedStartDate,

              endDate,

              /*
               * These now represent the
               * actionable day's workload.
               */
              totalAvailableMinutes:
                usableMinutes,

              totalRequiredMinutes:
                uniqueTasks.reduce(
                  (
                    sum,
                    task,
                  ) =>
                    sum +
                    task.estimatedMinutes,
                  0,
                ),

              status:
                "active",

              warnings: [],

              config: {
                days:
                  totalDays,

                dailyPlanOnly:
                  true,

                taskDate:
                  effectiveDate,

                usableMinutes,

                scheduledMinutes:
                  uniqueTasks.reduce(
                    (
                      sum,
                      task,
                    ) =>
                      sum +
                      task.estimatedMinutes,
                    0,
                  ),

                unusedMinutes:
                  Math.max(
                    0,
                    usableMinutes -
                      uniqueTasks.reduce(
                        (
                          sum,
                          task,
                        ) =>
                          sum +
                          task.estimatedMinutes,
                        0,
                      ),
                  ),

                subjectsTouched:
                  Array.from(
                    new Set(
                      uniqueTasks.map(
                        (task) =>
                          task.subjectSlug,
                      ),
                    ),
                  ),
              },
            })
            .returning();

        /*
         * Insert unique daily tasks.
         */
        await tx
          .insert(
            studyTasks,
          )
          .values(
            uniqueTasks.map(
              (task) => ({
                userId,

                planId:
                  created.id,

                chapterId:
                  task.chapterId,

                subjectSlug:
                  task.subjectSlug,

                taskType:
                  task.taskType,

                title:
                  task.title,

                estimatedMinutes:
                  task.estimatedMinutes,

                scheduledDate:
                  task.scheduledDate,

                status:
                  "pending" as const,

                priority:
                  task.priority,

                revisionNumber:
                  task.revisionNumber,
              }),
            ),
          );

        /*
         * IMPORTANT:
         *
         * revisionSchedule is intentionally
         * untouched here.
         *
         * Today engine's revision slot will be
         * added separately without destroying
         * revision history.
         */

        await tx
          .update(profiles)
          .set({
            planDurationDays:
              days,

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              profiles.userId,
              userId,
            ),
          );

        return created;
      },
    );

  const scheduledMinutes =
    uniqueTasks.reduce(
      (sum, task) =>
        sum +
        task.estimatedMinutes,
      0,
    );

  return NextResponse.json({
    plan,

    days:
      totalDays,

    daysLeft:
      totalDays,

    targetStartDate:
      requestedStartDate,

    targetEndDate:
      endDate,

    taskDate:
      effectiveDate,

    usableMinutes,

    scheduledMinutes,

    unusedMinutes:
      Math.max(
        0,
        usableMinutes -
          scheduledMinutes,
      ),

    subjectsTouched:
      Array.from(
        new Set(
          uniqueTasks.map(
            (task) =>
              task.subjectSlug,
          ),
        ),
      ),

    taskCount:
      uniqueTasks.length,
  });
}
