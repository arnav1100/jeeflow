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
  revisionSchedule,
  studyPlans,
  studyTasks,
} from "@/db/schema";

import { generateStudyPlan } from "@/lib/scheduling/engine";

import {
  buildAvailabilityMap,
  buildAvailabilityWindows,
  buildEngineChapters,
  buildExistingRevisions,
  buildUpcomingTests,
} from "@/lib/data/plan-context";

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
    .literal(
      "full_syllabus",
    )
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
    schema.safeParse(body);

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

  const startDate =
    parsed.data.startDate ??
    todayIST();

  const days =
    parsed.data.days;

  const endDate =
    addDaysYmd(
      startDate,
      days - 1,
    );

  /*
   * Exact task schedule = TODAY only.
   *
   * Long-term target remains endDate.
   */
  const scheduleEndDate =
    startDate;

  const [
    profileRows,
    chaptersList,
    availabilityMap,
    availabilityWindows,
    upcomingTests,
    existingRevisions,
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

    buildUpcomingTests(
      userId,
      startDate,
    ),

    buildExistingRevisions(
      userId,
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
    weeklyMinutes === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Add your study availability in Profile first.",
      },
      { status: 422 },
    );
  }

  /*
   * For TODAY, don't use the entire day's
   * availability if half the day has already passed.
   */
  const now =
    new Date();

  const ist =
    getISTParts(now);

  const todayWindows =
    availabilityWindows.filter(
      (window) =>
        window.dayOfWeek ===
        ist.weekday,
    );

  const rawRemainingToday =
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

  const todayCapacity =
    applyStudyBuffer(
      rawRemainingToday,
      15,
    );

  if (
    startDate ===
    todayIST()
  ) {
    availabilityMap[
      ist.weekday
    ] = todayCapacity;
  }

    /*
   * If today's study window is already over,
   * move the actionable plan to the next day
   * that has study availability.
   */
  let effectiveStartDate =
    startDate;

  if (
    startDate === todayIST() &&
    todayCapacity < 10
  ) {
    for (let offset = 1; offset <= 7; offset++) {
      const candidateDate =
        addDaysYmd(
          startDate,
          offset,
        );

      const candidate =
        new Date(
          `${candidateDate}T12:00:00Z`,
        );

      const weekday =
        candidate.getUTCDay();

      if (
        (availabilityMap[weekday] ?? 0) >=
        10
      ) {
        effectiveStartDate =
          candidateDate;
        break;
      }
    }
  }

  const result =
    generateStudyPlan({
      userId,

      startDate: effectiveStartDate,
      endDate,

      scheduleEndDate: effectiveStartDate,

      strategy:
        "full_syllabus",

      availabilityMinutesByWeekday:
        availabilityMap,

      tests:
        upcomingTests,

      chapters:
        chaptersList,

      revisionIntervalsDays:
        profile.revisionIntervalsDays as number[],

      revisionMinutesPerSession:
        profile.revisionMinutesPerSession,

      existingRevisions,
    });

  if (
    result.tasks.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          result.emptyReason ??
          "Nothing needs to be scheduled today.",
      },
      { status: 422 },
    );
  }

  const totalDays =
    daysBetween(
      startDate,
      endDate,
    ) + 1;

  const plan =
    await db.transaction(
      async (tx) => {
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

              startDate,
              endDate,

              totalAvailableMinutes:
                todayCapacity,

              totalRequiredMinutes:
                result.scheduledMinutes,

              status:
                "active",

              /*
               * Feasibility warnings are deliberately
               * not shown as the student's daily plan.
               */
              warnings: [],

              config: {
                days:
                  totalDays,

                dailyPlanOnly:
                  true,

                todayCapacityMinutes:
                  todayCapacity,

                scheduledMinutes:
                  result.scheduledMinutes,
              },
            })
            .returning();

        if (
          result.tasks.length >
          0
        ) {
          await tx
            .insert(
              studyTasks,
            )
            .values(
              result.tasks.map(
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
        }

        /*
         * Preserve completed revisions.
         * Rebuild only pending/scheduled ones.
         */
        await tx
          .delete(
            revisionSchedule,
          )
          .where(
            and(
              eq(
                revisionSchedule.userId,
                userId,
              ),
              ne(
                revisionSchedule.status,
                "done",
              ),
            ),
          );

        const completedKeys =
          new Set(
            existingRevisions
              .filter(
                (revision) =>
                  revision.status ===
                  "done",
              )
              .map(
                (revision) =>
                  `${revision.chapterId}:${revision.revisionNumber}`,
              ),
          );

        const revisionsToInsert =
          result.revisions.filter(
            (revision) =>
              !completedKeys.has(
                `${revision.chapterId}:${revision.revisionNumber}`,
              ),
          );

        if (
          revisionsToInsert.length >
          0
        ) {
          await tx
            .insert(
              revisionSchedule,
            )
            .values(
              revisionsToInsert.map(
                (revision) => ({
                  userId,

                  chapterId:
                    revision.chapterId,

                  revisionNumber:
                    revision.revisionNumber,

                  intervalDays:
                    revision.intervalDays,

                  dueDate:
                    revision.dueDate,

                  status:
                    revision.status ===
                    "pending"
                      ? ("pending" as const)
                      : revision.status ===
                          "skipped"
                        ? ("skipped" as const)
                        : ("scheduled" as const),
                }),
              ),
            );
        }

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

  return NextResponse.json({
    plan,

    days:
      totalDays,

    daysLeft:
      totalDays,

    startDate,
    endDate,

    todayCapacityMinutes:
      todayCapacity,

    taskCount:
      result.tasks.length,

    scheduledMinutes:
      result.scheduledMinutes,
  });
}
