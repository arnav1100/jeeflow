import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { profiles, availability, fixedEvents, pyqSettings, userChapters, chapters, subjects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { defaultPyqMinutes } from "@/lib/scheduling/lecture-time";

const windowSchema = z.object({ start: z.string(), end: z.string() });
const daySchema = z.object({ dayOfWeek: z.number().min(0).max(6), windows: z.array(windowSchema) });
const eventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  category: z.enum(["coaching", "school", "gym", "tuition", "travel", "sleep", "other"]),
  start: z.string(),
  end: z.string(),
  days: z.array(z.number().min(0).max(6)),
});

const schema = z.object({
  name: z.string().min(1),
  targetExam: z.string().min(1),
  targetYear: z.number(),
  targetDate: z.string().optional(),
  studentType: z.enum(["dropper", "class12", "class11"]),
  availability: z.array(daySchema),
  fixedEvents: z.array(eventSchema),
  physicsLevel: z.enum(["weak", "average", "strong"]),
  chemistryLevel: z.enum(["weak", "average", "strong"]),
  mathsLevel: z.enum(["weak", "average", "strong"]),
  targetScore: z.number(),
  strategy: z.enum([
    "full_syllabus",
    "bucket_strategy",
    "high_weightage_first",
    "backlog_completion",
    "revision_focus",
    "custom_chapters",
  ]),
  selectedBuckets: z.array(z.number()),
  planDurationDays: z.number(),
  customDeadline: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid onboarding data." }, { status: 400 });
  }
  const data = parsed.data;
  const userId = session.userId;

  try {
    await db
      .update(profiles)
      .set({
        name: data.name,
        targetExam: data.targetExam,
        targetYear: data.targetYear,
        targetDate: data.targetDate || null,
        studentType: data.studentType,
        physicsLevel: data.physicsLevel,
        chemistryLevel: data.chemistryLevel,
        mathsLevel: data.mathsLevel,
        targetScore: data.targetScore,
        strategy: data.strategy,
        planDurationDays: data.planDurationDays,
        customDeadline: data.customDeadline || null,
        strategyConfig: { selectedBuckets: data.selectedBuckets },
        onboardingCompleted: true,
        onboardingStep: 7,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));

    await db.delete(availability).where(eq(availability.userId, userId));
    const availabilityRows = data.availability.flatMap((d) =>
      d.windows.map((w) => ({ userId, dayOfWeek: d.dayOfWeek, startTime: w.start, endTime: w.end })),
    );
    if (availabilityRows.length > 0) {
      await db.insert(availability).values(availabilityRows);
    }

    await db.delete(fixedEvents).where(eq(fixedEvents.userId, userId));
    if (data.fixedEvents.length > 0) {
      await db.insert(fixedEvents).values(
        data.fixedEvents.map((e) => ({
          userId,
          title: e.title,
          category: e.category,
          startTime: e.start,
          endTime: e.end,
          daysOfWeek: e.days,
        })),
      );
    }

    const existingPyq = await db.select().from(pyqSettings).where(eq(pyqSettings.userId, userId)).limit(1);
    if (existingPyq.length === 0) {
      await db.insert(pyqSettings).values({ userId });
    }

    // Initialize a user_chapters row for every syllabus chapter so the
    // Syllabus screen and planner always have something to work with.
    const existingUserChapters = await db.select({ chapterId: userChapters.chapterId }).from(userChapters).where(eq(userChapters.userId, userId));
    const existingIds = new Set(existingUserChapters.map((r) => r.chapterId));

    const allChapters = await db.select().from(chapters);
    const allSubjects = await db.select().from(subjects);
    const subjectIdToSlug = new Map(allSubjects.map((s) => [s.id, s.slug]));
    const confidenceBySubject: Record<string, "weak" | "average" | "strong"> = {
      physics: data.physicsLevel,
      chemistry: data.chemistryLevel,
      maths: data.mathsLevel,
    };

    const toInsert = allChapters
      .filter((c) => !existingIds.has(c.id))
      .map((c) => {
        const slug = subjectIdToSlug.get(c.subjectId) ?? "physics";
        return {
          userId,
          chapterId: c.id,
          lectureOriginalMinutes: c.defaultLectureMinutes,
          lectureDurationMinutes: Math.round(c.defaultLectureMinutes * 1.2),
          lectureProgressMinutes: 0,
          durationType: "original" as const,
          playbackSpeed: 1,
          noteOverheadPercent: 20,
          practiceMinutes: 60,
          pyqMinutes: defaultPyqMinutes(c.sizeCategory as "small" | "medium" | "large"),
          confidence: confidenceBySubject[slug] ?? "average",
          bucket: c.defaultBucket,
          status: "not_started" as const,
        };
      });

    if (toInsert.length > 0) {
      await db.insert(userChapters).values(toInsert);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("onboarding complete error", err);
    return NextResponse.json({ error: "Could not save onboarding." }, { status: 500 });
  }
}
