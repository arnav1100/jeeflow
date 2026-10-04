import { db } from "@/db";
import { studyPlans, studyTasks, chapters, subjects, userChapters } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { TaskItem } from "@/components/tasks/types";

export async function getActivePlan(userId: string) {
  const rows = await db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.userId, userId), eq(studyPlans.status, "active")))
    .orderBy(desc(studyPlans.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTasksForPlan(userId: string, planId: string): Promise<TaskItem[]> {
  const rows = await db
    .select({
      task: studyTasks,
      chapterName: chapters.name,
    })
    .from(studyTasks)
    .leftJoin(chapters, eq(studyTasks.chapterId, chapters.id))
    .where(and(eq(studyTasks.userId, userId), eq(studyTasks.planId, planId)))
    .orderBy(asc(studyTasks.scheduledDate));

  const TYPE_RANK: Record<string, number> = { test: 0, lecture: 1, practice: 2, pyq: 3, revision: 4 };
  // Keep a chapter's tasks together and in study order: lecture -> practice -> PYQ -> revision.
  rows.sort((a, b) => {
    const da = String(a.task.scheduledDate);
    const db_ = String(b.task.scheduledDate);
    if (da !== db_) return da < db_ ? -1 : 1;
    if (a.task.priority !== b.task.priority) return b.task.priority - a.task.priority;
    const ca = a.chapterName ?? a.task.title;
    const cb = b.chapterName ?? b.task.title;
    if (ca !== cb) return ca < cb ? -1 : 1;
    return (TYPE_RANK[a.task.taskType] ?? 9) - (TYPE_RANK[b.task.taskType] ?? 9);
  });

  return rows.map(({ task, chapterName }) => ({
    id: task.id,
    chapterId: task.chapterId,
    subjectSlug: task.subjectSlug,
    taskType: task.taskType,
    title: chapterName ?? task.title,
    estimatedMinutes: task.estimatedMinutes,
    scheduledDate: task.scheduledDate as unknown as string,
    status: task.status,
    revisionNumber: task.revisionNumber,
  }));
}

export interface ProgressSummary {
  bySubject: { slug: string; name: string; color: string; total: number; completed: number; percent: number }[];
  byBucket: { bucket: number; total: number; completed: number; percent: number }[];
  overallPercent: number;
}

/** Weighted chapter progress: lecture 40%, practice 20%, PYQ 25%, revision 15%. */
function chapterFraction(uc: typeof userChapters.$inferSelect | undefined): number {
  if (!uc) return 0;
  const lecture = uc.lectureDurationMinutes > 0 ? Math.min(1, uc.lectureProgressMinutes / uc.lectureDurationMinutes) : 0;
  const practice = uc.practiceStatus === "done" ? 1 : 0;
  const pyq = uc.pyqStatus === "done" ? 1 : 0;
  const revision = uc.revisionStatus === "done" ? 1 : uc.revisionStatus === "partial" ? 0.5 : 0;
  return lecture * 0.4 + practice * 0.2 + pyq * 0.25 + revision * 0.15;
}

export async function getProgressSummary(userId: string): Promise<ProgressSummary> {
  const [allSubjects, allChapters, ucs] = await Promise.all([
    db.select().from(subjects),
    db.select().from(chapters),
    db.select().from(userChapters).where(eq(userChapters.userId, userId)),
  ]);
  const ucByChapter = new Map(ucs.map((u) => [u.chapterId, u]));

  const bySubject = allSubjects.map((s) => {
    const list = allChapters.filter((c) => c.subjectId === s.id);
    const completed = list.filter((c) => ucByChapter.get(c.id)?.status === "completed").length;
    const fraction = list.reduce((sum, c) => sum + chapterFraction(ucByChapter.get(c.id)), 0);
    return {
      slug: s.slug,
      name: s.name,
      color: s.color,
      total: list.length,
      completed,
      percent: list.length ? Math.round((fraction / list.length) * 100) : 0,
    };
  });
  const order = ["physics", "chemistry", "maths"];
  bySubject.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));

  const byBucket = [1, 2, 3].map((bucket) => {
    const list = allChapters.filter((c) => (ucByChapter.get(c.id)?.bucket ?? c.defaultBucket) === bucket);
    const completed = list.filter((c) => ucByChapter.get(c.id)?.status === "completed").length;
    const fraction = list.reduce((sum, c) => sum + chapterFraction(ucByChapter.get(c.id)), 0);
    return {
      bucket,
      total: list.length,
      completed,
      percent: list.length ? Math.round((fraction / list.length) * 100) : 0,
    };
  });

  const totalFraction = allChapters.reduce((sum, c) => sum + chapterFraction(ucByChapter.get(c.id)), 0);
  return {
    bySubject,
    byBucket,
    overallPercent: allChapters.length ? Math.round((totalFraction / allChapters.length) * 100) : 0,
  };
}
