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

/**
 * Build the chapter data required by the planner.
 */
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
      .where(
        eq(
          userChapters.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(chapterPrerequisites),
  ]);

  const subjectById = new Map(
    allSubjects.map((subject) => [
      subject.id,
      subject,
    ]),
  );

  const userChapterByChapterId =
    new Map(
      allUserChapters.map(
        (userChapter) => [
          userChapter.chapterId,
          userChapter,
        ],
      ),
    );

  const prereqsByChapter =
    new Map<string, string[]>();

  for (const prereq of allPrereqs) {
    const list =
      prereqsByChapter.get(
        prereq.chapterId,
      ) ?? [];

    list.push(
      prereq.prerequisiteChapterId,
    );

    prereqsByChapter.set(
      prereq.chapterId,
      list,
    );
  }

  const result: EngineChapter[] = [];

  for (const chapter of allChapters) {
    const userChapter =
      userChapterByChapterId.get(
        chapter.id,
      );

    // Chapter has not been initialized
    // for this user.
    if (!userChapter) {
      continue;
    }

    const subject =
      subjectById.get(
        chapter.subjectId,
      );

    const subjectSlug =
      (subject?.slug as SubjectSlug) ??
      "physics";

    /*
     * Database orderIndex is the single
     * source of truth for chapter sequence.
     */
    const sequenceOrder =
      chapter.orderIndex;

    result.push({
      chapterId:
        chapter.id,

      subjectSlug,

      name:
        chapter.name,

      sequenceOrder,

      weightage:
        chapter.weightage,

      bucket:
        userChapter.bucket,

      prerequisiteIds:
        prereqsByChapter.get(
          chapter.id,
        ) ?? [],

      status:
        userChapter.status as EngineChapter["status"],

      confidence:
        userChapter.confidence as EngineChapter["confidence"],

      prerequisiteChoice:
        userChapter.prerequisiteChoice,

      lectureDurationMinutes:
        Math.max(
          0,
          userChapter.lectureDurationMinutes,
        ),

      lectureProgressMinutes:
        Math.max(
          0,
          userChapter.lectureProgressMinutes,
        ),

      manualDurationSet:
        userChapter.manualOverrideMinutes !==
        null,

      remainingLectureMinutes:
        Math.max(
          0,
          userChapter.lectureDurationMinutes -
            userChapter.lectureProgressMinutes,
        ),

      practicePendingMinutes:
        userChapter.practiceStatus ===
        "done"
          ? 0
          : userChapter.practiceMinutes,

      pyqPendingMinutes:
        userChapter.pyqStatus ===
        "done"
          ? 0
          : userChapter.pyqMinutes,

      revisionStatus:
        userChapter.revisionStatus as EngineChapter["revisionStatus"],

      startedAt:
        userChapter.startedAt
          ? userChapter.startedAt.toISOString()
          : null,
    });
  }

  return result;
}

/**
 * Weekly availability totals.
 *
 * Used by long-term feasibility calculations.
 *
 * key:
 * 0 = Sunday
 * 1 = Monday
 * ...
 * 6 = Saturday
 */
export async function buildAvailabilityMap(
  userId: string,
): Promise<Record<number, number>> {
  const rows = await db
    .select()
    .from(availability)
    .where(
      eq(
        availability.userId,
        userId,
      ),
    );

  const map: Record<
    number,
    number
  > = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };

  for (const row of rows) {
    const [startHour, startMinute] =
      row.startTime
        .split(":")
        .map(Number);

    const [endHour, endMinute] =
      row.endTime
        .split(":")
        .map(Number);

    let minutes = 0;

    const start =
      startHour * 60 +
      startMinute;

    const end =
      endHour * 60 +
      endMinute;

    /*
     * Normal window:
     * 16:00 -> 22:00
     */
    if (end > start) {
      minutes =
        end - start;
    } else if (end < start) {
      /*
       * Overnight window:
       * 20:00 -> 01:00
       */
      minutes =
        24 * 60 -
        start +
        end;
    }

    map[row.dayOfWeek] =
      (map[row.dayOfWeek] ?? 0) +
      Math.max(
        0,
        minutes,
      );
  }

  return map;
}

/**
 * Raw availability windows.
 *
 * Used by the today scheduler because
 * it needs clock times, not only totals.
 */
export async function buildAvailabilityWindows(
  userId: string,
) {
  const rows = await db
    .select()
    .from(availability)
    .where(
      eq(
        availability.userId,
        userId,
      ),
    );

  return rows.map((row) => ({
    dayOfWeek:
      row.dayOfWeek,

    startTime:
      row.startTime,

    endTime:
      row.endTime,
  }));
}

/**
 * Upcoming tests from the selected date.
 */
export async function buildUpcomingTests(
  userId: string,
  fromDate: string,
): Promise<EngineTestEvent[]> {
  const rows = await db
    .select()
    .from(tests)
    .where(
      eq(
        tests.userId,
        userId,
      ),
    );

  return rows
    .map((test) => ({
      ...test,

      dateStr:
        typeof test.testDate ===
        "string"
          ? test.testDate
          : format(
              test.testDate as unknown as Date,
              "yyyy-MM-dd",
            ),
    }))
    .filter(
      (test) =>
        test.dateStr >=
        fromDate,
    )
    .map((test) => ({
      date:
        test.dateStr,

      durationMinutes:
        test.durationMinutes,

      travelMinutes:
        test.travelMinutes,

      title:
        test.title,
    }));
}

/**
 * Existing revision history.
 *
 * This allows plan regeneration without
 * losing already completed revisions.
 */
export async function buildExistingRevisions(
  userId: string,
): Promise<
  EngineExistingRevision[]
> {
  const rows = await db
    .select()
    .from(revisionSchedule)
    .where(
      eq(
        revisionSchedule.userId,
        userId,
      ),
    );

  return rows.map((row) => ({
    chapterId:
      row.chapterId,

    revisionNumber:
      row.revisionNumber,

    intervalDays:
      row.intervalDays,

    dueDate:
      typeof row.dueDate ===
      "string"
        ? row.dueDate
        : format(
            row.dueDate as unknown as Date,
            "yyyy-MM-dd",
          ),

    status:
      row.status as EngineExistingRevision["status"],
  }));
}
