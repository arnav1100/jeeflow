import { db } from "@/db";
import { chapters, subjects, userChapters, studyTasks } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";

export interface ChapterProgressRow {
  chapterId: string;
  name: string;
  subjectSlug: string;
  bucket: number;
  status: string;
  percent: number;
  weightage: number;
}

export interface DayStat {
  date: string;
  plannedMinutes: number;
  doneMinutes: number;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export async function getChapterProgress(userId: string): Promise<ChapterProgressRow[]> {
  const [allSubjects, allChapters, ucs] = await Promise.all([
    db.select().from(subjects),
    db.select().from(chapters),
    db.select().from(userChapters).where(eq(userChapters.userId, userId)),
  ]);
  const slugBySubject = new Map(allSubjects.map((s) => [s.id, s.slug]));
  const ucByChapter = new Map(ucs.map((u) => [u.chapterId, u]));

  return allChapters
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((c) => {
      const uc = ucByChapter.get(c.id);
      let percent = 0;
      if (uc) {
        const lecture = uc.lectureDurationMinutes > 0 ? Math.min(1, uc.lectureProgressMinutes / uc.lectureDurationMinutes) : 0;
        const revision = uc.revisionStatus === "done" ? 1 : uc.revisionStatus === "partial" ? 0.5 : 0;
        percent = Math.round(
          (lecture * 0.4 + (uc.practiceStatus === "done" ? 0.2 : 0) + (uc.pyqStatus === "done" ? 0.25 : 0) + revision * 0.15) * 100,
        );
      }
      return {
        chapterId: c.id,
        name: c.name,
        subjectSlug: slugBySubject.get(c.subjectId) ?? "physics",
        bucket: uc?.bucket ?? c.defaultBucket,
        status: uc?.status ?? "not_started",
        percent,
        weightage: c.weightage,
      };
    });
}

/** Planned vs completed study minutes for the 7 days ending on `today` (inclusive). */
export async function getLast7Days(userId: string, today: string): Promise<DayStat[]> {
  const from = addDaysYmd(today, -6);
  const rows = await db
    .select({ date: studyTasks.scheduledDate, minutes: studyTasks.estimatedMinutes, status: studyTasks.status })
    .from(studyTasks)
    .where(and(eq(studyTasks.userId, userId), gte(studyTasks.scheduledDate, from), lte(studyTasks.scheduledDate, today)));

  const stats = new Map<string, DayStat>();
  for (let i = 0; i < 7; i++) {
    const d = addDaysYmd(from, i);
    stats.set(d, { date: d, plannedMinutes: 0, doneMinutes: 0 });
  }
  for (const r of rows) {
    const s = stats.get(r.date as unknown as string);
    if (!s) continue;
    s.plannedMinutes += r.minutes;
    if (r.status === "done") s.doneMinutes += r.minutes;
  }
  return Array.from(stats.values());
}
