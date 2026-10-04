import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { userChapters } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { calculatePlannedLectureMinutes } from "@/lib/scheduling/lecture-time";
import { computeChapterStatus } from "@/lib/scheduling/chapter-status";

const schema = z.object({
  lectureOriginalMinutes: z.number().min(0).optional(),
  durationType: z.enum(["original", "actual_watch"]).optional(),
  playbackSpeed: z.number().min(0.25).max(3).optional(),
  noteOverheadPercent: z.number().min(0).max(100).optional(),
  manualOverrideMinutes: z.number().min(0).nullable().optional(),
  lectureProgressMinutes: z.number().min(0).optional(),
  practiceMinutes: z.number().min(0).optional(),
  practiceStatus: z.enum(["pending", "done"]).optional(),
  pyqMinutes: z.number().min(0).optional(),
  pyqStatus: z.enum(["pending", "done"]).optional(),
  revisionStatus: z.enum(["pending", "partial", "done"]).optional(),
  confidence: z.enum(["weak", "average", "strong"]).optional(),
  bucket: z.number().min(1).max(3).optional(),
  prerequisiteChoice: z.enum(["add_prerequisite", "basics_only", "already_know"]).nullable().optional(),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ chapterId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { chapterId } = await context.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const rows = await db
    .select()
    .from(userChapters)
    .where(and(eq(userChapters.userId, session.userId), eq(userChapters.chapterId, chapterId)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: "Chapter not found." }, { status: 404 });

  const merged = { ...existing, ...data };

  const computedLectureMinutes =
    merged.manualOverrideMinutes ??
    calculatePlannedLectureMinutes({
      durationType: merged.durationType as "original" | "actual_watch",
      originalMinutes: merged.lectureOriginalMinutes,
      playbackSpeed: merged.playbackSpeed,
      noteOverheadPercent: merged.noteOverheadPercent,
    });

  const status = computeChapterStatus({
    lectureDurationMinutes: computedLectureMinutes,
    lectureProgressMinutes: merged.lectureProgressMinutes,
    practiceStatus: merged.practiceStatus,
    pyqStatus: merged.pyqStatus,
    revisionStatus: merged.revisionStatus,
  });

  const now = new Date();
  const [updated] = await db
    .update(userChapters)
    .set({
      lectureOriginalMinutes: merged.lectureOriginalMinutes,
      durationType: merged.durationType,
      playbackSpeed: merged.playbackSpeed,
      noteOverheadPercent: merged.noteOverheadPercent,
      manualOverrideMinutes: data.manualOverrideMinutes === undefined ? existing.manualOverrideMinutes : data.manualOverrideMinutes,
      lectureDurationMinutes: computedLectureMinutes,
      lectureProgressMinutes: merged.lectureProgressMinutes,
      practiceMinutes: merged.practiceMinutes,
      practiceStatus: merged.practiceStatus,
      pyqMinutes: merged.pyqMinutes,
      pyqStatus: merged.pyqStatus,
      revisionStatus: merged.revisionStatus,
      confidence: merged.confidence,
      bucket: merged.bucket,
      prerequisiteChoice: data.prerequisiteChoice === undefined ? existing.prerequisiteChoice : data.prerequisiteChoice,
      status,
      startedAt: existing.startedAt ?? (status !== "not_started" ? now : null),
      completedAt: status === "completed" ? now : null,
      updatedAt: now,
    })
    .where(and(eq(userChapters.userId, session.userId), eq(userChapters.chapterId, chapterId)))
    .returning();

  return NextResponse.json({ userChapter: updated, computedLectureMinutes, status });
}
