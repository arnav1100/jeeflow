import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { studyPlans, studyTasks, revisionSchedule, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateStudyPlan } from "@/lib/scheduling/engine";
import { buildAvailabilityMap, buildEngineChapters, buildUpcomingTests } from "@/lib/data/plan-context";
import type { Strategy } from "@/lib/scheduling/types";

const schema = z.object({
  strategy: z
    .enum(["full_syllabus", "bucket_strategy", "high_weightage_first", "backlog_completion", "revision_focus", "custom_chapters"])
    .optional(),
  selectedBuckets: z.array(z.number()).optional(),
  customChapterIds: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const userId = session.userId;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = profileRows[0];
  if (!profile) return NextResponse.json({ error: "Complete onboarding first." }, { status: 400 });

  const strategy = (parsed.data.strategy ?? profile.strategy) as Strategy;
  const today = format(new Date(), "yyyy-MM-dd");
  const startDate = parsed.data.startDate ?? today;
  let endDate = parsed.data.endDate;
  if (!endDate) {
    if (profile.customDeadline) endDate = profile.customDeadline as unknown as string;
    else endDate = format(addDays(new Date(startDate), profile.planDurationDays || 60), "yyyy-MM-dd");
  }

  const [chaptersList, availabilityMap, upcomingTests] = await Promise.all([
    buildEngineChapters(userId),
    buildAvailabilityMap(userId),
    buildUpcomingTests(userId, startDate),
  ]);

  const strategyConfig = (profile.strategyConfig as Record<string, unknown>) ?? {};
  const selectedBuckets = parsed.data.selectedBuckets ?? (strategyConfig.selectedBuckets as number[] | undefined);

  const result = generateStudyPlan({
    userId,
    startDate,
    endDate,
    strategy,
    selectedBuckets,
    customChapterIds: parsed.data.customChapterIds,
    availabilityMinutesByWeekday: availabilityMap,
    tests: upcomingTests,
    chapters: chaptersList,
    revisionIntervalsDays: profile.revisionIntervalsDays as number[],
    revisionMinutesPerSession: profile.revisionMinutesPerSession,
  });

  // Archive previous active plans and clear their not-yet-completed tasks so
  // regeneration doesn't leave stale/duplicate work behind. Completed tasks
  // are preserved (never move already completed tasks).
  await db.update(studyPlans).set({ status: "archived" }).where(eq(studyPlans.userId, userId));
  await db.delete(studyTasks).where(eq(studyTasks.userId, userId));

  const [plan] = await db
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
      config: { selectedBuckets: selectedBuckets ?? [], customChapterIds: parsed.data.customChapterIds ?? [] },
    })
    .returning();

  if (result.tasks.length > 0) {
    await db.insert(studyTasks).values(
      result.tasks.map((t) => ({
        userId,
        planId: plan.id,
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
  }

  await db.delete(revisionSchedule).where(eq(revisionSchedule.userId, userId));
  if (result.revisions.length > 0) {
    await db.insert(revisionSchedule).values(
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

  return NextResponse.json({
    plan,
    feasibility: result.feasibility,
    warnings: result.warnings,
    trimmedChapterIds: result.trimmedChapterIds,
    taskCount: result.tasks.length,
  });
}
