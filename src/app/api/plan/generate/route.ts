import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { studyPlans, studyTasks, revisionSchedule, profiles } from "@/db/schema";
import { generateStudyPlan } from "@/lib/scheduling/engine";
import { buildAvailabilityMap, buildEngineChapters, buildUpcomingTests } from "@/lib/data/plan-context";
import { addDaysYmd, daysBetween, todayIST } from "@/lib/date";
import type { Strategy } from "@/lib/scheduling/types";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  strategy: z
    .enum(["full_syllabus", "bucket_strategy", "high_weightage_first", "backlog_completion", "revision_focus", "custom_chapters"])
    .optional(),
  selectedBuckets: z.array(z.number()).optional(),
  customChapterIds: z.array(z.string()).optional(),
  startDate: ymd.optional(),
  endDate: ymd.optional(),
  /** How many days the student wants to finish in (start date counts as day 1). */
  days: z.number().int().min(1).max(365).optional(),
  /** Compute feasibility only; nothing is written. Used for the live preview. */
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const userId = session.userId;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const input = parsed.data;

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = profileRows[0];
  if (!profile) return NextResponse.json({ error: "Complete onboarding first." }, { status: 400 });

  const strategy = (input.strategy ?? profile.strategy) as Strategy;
  const startDate = input.startDate ?? todayIST();

  let days = input.days;
  let endDate = input.endDate;
  if (!endDate) {
    const customDeadline = profile.customDeadline as unknown as string | null;
    if (!days && customDeadline && customDeadline >= startDate) {
      endDate = customDeadline;
    } else {
      days = days ?? (profile.planDurationDays || 60);
      endDate = addDaysYmd(startDate, days - 1);
    }
  }
  if (endDate < startDate) return NextResponse.json({ error: "End date must be after the start date." }, { status: 400 });
  const totalDays = daysBetween(startDate, endDate) + 1;

  const [chaptersList, availabilityMap, upcomingTests] = await Promise.all([
    buildEngineChapters(userId),
    buildAvailabilityMap(userId),
    buildUpcomingTests(userId, startDate),
  ]);

  const weeklyMinutes = Object.values(availabilityMap).reduce((s, m) => s + m, 0);
  if (weeklyMinutes === 0) {
    return NextResponse.json(
      { error: "You have no study time set. Add your daily study windows in Profile first." },
      { status: 422 },
    );
  }

  const strategyConfig = (profile.strategyConfig as Record<string, unknown>) ?? {};
  const selectedBuckets = input.selectedBuckets ?? (strategyConfig.selectedBuckets as number[] | undefined);

  const result = generateStudyPlan({
    userId,
    startDate,
    endDate,
    strategy,
    selectedBuckets,
    customChapterIds: input.customChapterIds,
    availabilityMinutesByWeekday: availabilityMap,
    tests: upcomingTests,
    chapters: chaptersList,
    revisionIntervalsDays: profile.revisionIntervalsDays as number[],
    revisionMinutesPerSession: profile.revisionMinutesPerSession,
  });

  const summary = {
    days: totalDays,
    startDate,
    endDate,
    feasibility: result.feasibility,
    warnings: result.warnings,
    emptyReason: result.emptyReason,
    trimmedCount: result.trimmedChapterIds.length,
    taskCount: result.tasks.length,
    scheduledMinutes: result.scheduledMinutes,
  };

  if (input.dryRun) return NextResponse.json({ dryRun: true, ...summary });

  // Nothing to schedule: keep the existing plan and tell the user why.
  if (result.emptyReason || result.tasks.length === 0) {
    return NextResponse.json(
      { error: result.emptyReason ?? "Nothing could be scheduled with your current availability.", ...summary },
      { status: 422 },
    );
  }

  const plan = await db.transaction(async (tx) => {
    // Archive old plans and drop their unfinished tasks. Finished tasks stay in history.
    await tx.update(studyPlans).set({ status: "archived" }).where(eq(studyPlans.userId, userId));
    await tx.delete(studyTasks).where(and(eq(studyTasks.userId, userId), ne(studyTasks.status, "done")));

    const [created] = await tx
      .insert(studyPlans)
      .values({
        userId,
        strategy,
        startDate,
        endDate,
        totalAvailableMinutes: result.feasibility.totalAvailableMinutes,
        totalRequiredMinutes: result.feasibility.totalRequiredMinutes,
        status: "active",
        warnings: result.warnings,
        config: {
          selectedBuckets: selectedBuckets ?? [],
          customChapterIds: input.customChapterIds ?? [],
          days: totalDays,
          suggestedDays: result.feasibility.suggestedDays,
          trimmedChapterCount: result.trimmedChapterIds.length,
          scheduledMinutes: result.scheduledMinutes,
        },
      })
      .returning();

    await tx.insert(studyTasks).values(
      result.tasks.map((t) => ({
        userId,
        planId: created.id,
        chapterId: t.chapterId,
        subjectSlug: t.subjectSlug,
        taskType: t.taskType,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        scheduledDate: t.scheduledDate,
        status: "pending" as const,
        priority: t.priority,
        revisionNumber: t.revisionNumber,
      })),
    );

    await tx.delete(revisionSchedule).where(eq(revisionSchedule.userId, userId));
    if (result.revisions.length > 0) {
      await tx.insert(revisionSchedule).values(
        result.revisions.map((r) => ({
          userId,
          chapterId: r.chapterId,
          revisionNumber: r.revisionNumber,
          intervalDays: r.intervalDays,
          dueDate: r.dueDate,
          status: "scheduled" as const,
        })),
      );
    }

    if (input.days) {
      await tx.update(profiles).set({ planDurationDays: input.days, updatedAt: new Date() }).where(eq(profiles.userId, userId));
    }
    return created;
  });

  return NextResponse.json({ plan, ...summary });
}
