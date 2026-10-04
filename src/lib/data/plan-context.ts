import { db } from "@/db";
import {
  chapters,
  subjects,
  userChapters,
  chapterPrerequisites,
  availability,
  tests,
  revisionSchedule,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import type {
  EngineChapter,
  EngineTestEvent,
  EngineExistingRevision,
  SubjectSlug,
} from "@/lib/scheduling/types";
import { getJeeSequenceOrder } from "@/lib/scheduling/jee-sequence";

export async function buildEngineChapters(
  userId: string,
): Promise<EngineChapter[]> {
  const [
    allSubjects,
    allChapters,
    allUserChapters,
    allPrereqs,
  ] = await Promise.all([
    db.select().from(subjects),
    db.select().from(chapters),
    db
      .select()
      .from(userChapters)
      .where(eq(userChapters.userId, userId)),
    db.select().from(chapterPrerequisites),
  ]);

  const subjectById = new Map(
    allSubjects.map((s) => [s.id, s]),
  );

  const ucByChapter = new Map(
    allUserChapters.map((uc) => [
      uc.chapterId,
      uc,
    ]),
  );

  const prereqsByChapter = new Map<
    string,
    string[]
  >();

  for (const p of allPrereqs) {
    const list =
      prereqsByChapter.get(p.chapterId) ?? [];

    list.push(p.prerequisiteChapterId);

    prereqsByChapter.set(
      p.chapterId,
      list,
    );
  }

  const result: EngineChapter[] = [];

  for (const c of allChapters) {
    const uc = ucByChapter.get(c.id);

    if (!uc) continue;

    const subject =
      subjectById.get(c.subjectId);

    const subjectSlug =
      (subject?.slug as SubjectSlug) ??
      "physics";

    /*
     * First use our exact JEE sequence.
     * If a DB chapter name does not match,
     * fall back to its existing orderIndex.
     */
    const sequenceOrder =
      getJeeSequenceOrder(
        subjectSlug,
        c.name,
      ) ??
      (c.orderIndex > 0
        ? c.orderIndex
        : 999);

    result.push({
      chapterId: c.id,
      subjectSlug,
      name: c.name,

      sequenceOrder,

      weightage: c.weightage,
      bucket: uc.bucket,

      prerequisiteIds:
        prereqsByChapter.get(c.id) ?? [],

      status:
        uc.status as EngineChapter["status"],

      confidence:
        uc.confidence as EngineChapter["confidence"],

      prerequisiteChoice:
        uc.prerequisiteChoice,

      lectureDurationMinutes:
        Math.max(
          0,
          uc.lectureDurationMinutes,
        ),

      lectureProgressMinutes:
        Math.max(
          0,
          uc.lectureProgressMinutes,
        ),

      manualDurationSet:
        uc.manualOverrideMinutes !== null,

      remainingLectureMinutes:
        Math.max(
          0,
          uc.lectureDurationMinutes -
            uc.lectureProgressMinutes,
        ),

      practicePendingMinutes:
        uc.practiceStatus === "done"
          ? 0
          : uc.practiceMinutes,

      pyqPendingMinutes:
        uc.pyqStatus === "done"
          ? 0
          : uc.pyqMinutes,

      revisionStatus:
        uc.revisionStatus as EngineChapter["revisionStatus"],

      startedAt:
        uc.startedAt
          ? uc.startedAt.toISOString()
          : null,
    });
  }

  return result;
}

export async function buildAvailabilityMap(
  userId: string,
): Promise<Record<number, number>> {
  const rows = await db
    .select()
    .from(availability)
    .where(
      eq(availability.userId, userId),
    );

  const map: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };

  for (const r of rows) {
    const [sh, sm] = r.startTime
      .split(":")
      .map(Number);

    const [eh, em] = r.endTime
      .split(":")
      .map(Number);

    const minutes = Math.max(
      0,
      eh * 60 +
        em -
        (sh * 60 + sm),
    );

    map[r.dayOfWeek] =
      (map[r.dayOfWeek] ?? 0) +
      minutes;
  }

  return map;
}

export async function buildUpcomingTests(
  userId: string,
  fromDate: string,
): Promise<EngineTestEvent[]> {
  const rows = await db
    .select()
    .from(tests)
    .where(eq(tests.userId, userId));

  return rows
    .map((t) => ({
      ...t,
      dateStr:
        typeof t.testDate === "string"
          ? t.testDate
          : format(
              t.testDate as unknown as Date,
              "yyyy-MM-dd",
            ),
    }))
    .filter(
      (t) => t.dateStr >= fromDate,
    )
    .map((t) => ({
      date: t.dateStr,
      durationMinutes:
        t.durationMinutes,
      travelMinutes:
        t.travelMinutes,
      title: t.title,
    }));
}

export async function buildExistingRevisions(
  userId: string,
): Promise<EngineExistingRevision[]> {
  const rows = await db
    .select()
    .from(revisionSchedule)
    .where(eq(revisionSchedule.userId, userId));

  return rows.map((row) => ({
    chapterId: row.chapterId,
    revisionNumber: row.revisionNumber,
    intervalDays: row.intervalDays,
    dueDate:
      typeof row.dueDate === "string"
        ? row.dueDate
        : format(
            row.dueDate as unknown as Date,
            "yyyy-MM-dd",
          ),
    status:
      row.status as EngineExistingRevision["status"],
  }));
}
