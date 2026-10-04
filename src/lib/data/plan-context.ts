import { db } from "@/db";
import { chapters, subjects, userChapters, chapterPrerequisites, availability, tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import type { EngineChapter, EngineTestEvent, SubjectSlug } from "@/lib/scheduling/types";

export async function buildEngineChapters(userId: string): Promise<EngineChapter[]> {
  const allSubjects = await db.select().from(subjects);
  const allChapters = await db.select().from(chapters);
  const allUserChapters = await db.select().from(userChapters).where(eq(userChapters.userId, userId));
  const allPrereqs = await db.select().from(chapterPrerequisites);

  const subjectById = new Map(allSubjects.map((s) => [s.id, s]));
  const ucByChapter = new Map(allUserChapters.map((uc) => [uc.chapterId, uc]));
  const prereqsByChapter = new Map<string, string[]>();
  for (const p of allPrereqs) {
    const list = prereqsByChapter.get(p.chapterId) ?? [];
    list.push(p.prerequisiteChapterId);
    prereqsByChapter.set(p.chapterId, list);
  }

  const result: EngineChapter[] = [];
  for (const c of allChapters) {
    const uc = ucByChapter.get(c.id);
    if (!uc) continue; // not initialized for this user yet
    const subject = subjectById.get(c.subjectId);

    result.push({
      chapterId: c.id,
      subjectSlug: (subject?.slug as SubjectSlug) ?? "physics",
      name: c.name,
      weightage: c.weightage,
      bucket: uc.bucket,
      prerequisiteIds: prereqsByChapter.get(c.id) ?? [],
      status: uc.status as EngineChapter["status"],
      confidence: uc.confidence as EngineChapter["confidence"],
      prerequisiteChoice: uc.prerequisiteChoice,
      remainingLectureMinutes: Math.max(0, uc.lectureDurationMinutes - uc.lectureProgressMinutes),
      practicePendingMinutes: uc.practiceStatus === "done" ? 0 : uc.practiceMinutes,
      pyqPendingMinutes: uc.pyqStatus === "done" ? 0 : uc.pyqMinutes,
      revisionStatus: uc.revisionStatus as EngineChapter["revisionStatus"],
      startedAt: uc.startedAt ? uc.startedAt.toISOString() : null,
    });
  }
  return result;
}

export async function buildAvailabilityMap(userId: string): Promise<Record<number, number>> {
  const rows = await db.select().from(availability).where(eq(availability.userId, userId));
  const map: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const r of rows) {
    const [sh, sm] = r.startTime.split(":").map(Number);
    const [eh, em] = r.endTime.split(":").map(Number);
    const minutes = Math.max(0, eh * 60 + em - (sh * 60 + sm));
    map[r.dayOfWeek] = (map[r.dayOfWeek] ?? 0) + minutes;
  }
  return map;
}

export async function buildUpcomingTests(userId: string, fromDate: string): Promise<EngineTestEvent[]> {
  const rows = await db
    .select()
    .from(tests)
    .where(eq(tests.userId, userId));
  return rows
    .filter((t) => t.testDate >= fromDate)
    .map((t) => ({
      date: typeof t.testDate === "string" ? t.testDate : format(t.testDate as unknown as Date, "yyyy-MM-dd"),
      durationMinutes: t.durationMinutes,
      travelMinutes: t.travelMinutes,
      title: t.title,
    }));
}
