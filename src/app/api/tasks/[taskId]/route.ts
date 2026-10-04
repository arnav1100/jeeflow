import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { studyTasks, userChapters, revisionSchedule } from "@/db/schema";
import { computeChapterStatus } from "@/lib/scheduling/chapter-status";

const schema = z.object({ status: z.enum(["pending", "done", "skipped"]) });

export async function PATCH(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const userId = session.userId;

  const { taskId } = await context.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  const nextStatus = parsed.data.status;

  const rows = await db
    .select()
    .from(studyTasks)
    .where(and(eq(studyTasks.id, taskId), eq(studyTasks.userId, userId)))
    .limit(1);
  const task = rows[0];
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const wasDone = task.status === "done";
  const willBeDone = nextStatus === "done";

  const [updatedTask] = await db
    .update(studyTasks)
    .set({ status: nextStatus, completedMinutes: willBeDone ? task.estimatedMinutes : 0 })
    .where(eq(studyTasks.id, taskId))
    .returning();

  // Keep the syllabus progress in sync, but only when the task moves into / out of "done".
  let chapterStatus: string | null = null;
  if (task.chapterId && wasDone !== willBeDone && task.taskType !== "test") {
    const ucRows = await db
      .select()
      .from(userChapters)
      .where(and(eq(userChapters.userId, userId), eq(userChapters.chapterId, task.chapterId)))
      .limit(1);
    const uc = ucRows[0];

    if (uc) {
      let lectureProgress = uc.lectureProgressMinutes;
      let practiceStatus = uc.practiceStatus;
      let pyqStatus = uc.pyqStatus;
      let revisionStatus = uc.revisionStatus;

      if (task.taskType === "lecture") {
        const delta = willBeDone ? task.estimatedMinutes : -task.estimatedMinutes;
        lectureProgress = Math.max(0, Math.min(uc.lectureDurationMinutes, lectureProgress + delta));
      } else if (task.taskType === "practice") {
        practiceStatus = willBeDone ? "done" : "pending";
      } else if (task.taskType === "pyq") {
        pyqStatus = willBeDone ? "done" : "pending";
      } else if (task.taskType === "revision" && task.revisionNumber != null) {
        await db
          .update(revisionSchedule)
          .set({ status: willBeDone ? "done" : "scheduled" })
          .where(
            and(
              eq(revisionSchedule.userId, userId),
              eq(revisionSchedule.chapterId, task.chapterId),
              eq(revisionSchedule.revisionNumber, task.revisionNumber),
            ),
          );
        const all = await db
          .select()
          .from(revisionSchedule)
          .where(and(eq(revisionSchedule.userId, userId), eq(revisionSchedule.chapterId, task.chapterId)));
        const doneCount = all.filter((r) => r.status === "done").length;
        revisionStatus = all.length > 0 && doneCount === all.length ? "done" : doneCount > 0 ? "partial" : "pending";
      }

      const status = computeChapterStatus({
        lectureDurationMinutes: uc.lectureDurationMinutes,
        lectureProgressMinutes: lectureProgress,
        practiceStatus,
        pyqStatus,
        revisionStatus,
      });
      const now = new Date();
      await db
        .update(userChapters)
        .set({
          lectureProgressMinutes: lectureProgress,
          practiceStatus,
          pyqStatus,
          revisionStatus,
          status,
          startedAt: uc.startedAt ?? (status !== "not_started" ? now : null),
          completedAt: status === "completed" ? now : null,
          updatedAt: now,
        })
        .where(eq(userChapters.id, uc.id));
      chapterStatus = status;
    }
  }

  return NextResponse.json({ task: updatedTask, chapterStatus });
}
