import type {
  EngineChapter,
  GeneratedTask,
  SubjectSlug,
} from "./types";

const SUBJECTS: SubjectSlug[] = [
  "physics",
  "chemistry",
  "maths",
];

const MIN_NORMAL_TASK = 20;
const MIN_EMERGENCY_TASK = 15;

const MAX_LECTURE = 90;
const MAX_PRACTICE = 60;
const MAX_PYQ = 60;

const MAX_REVISION = 30;

export interface DueRevision {
  chapterId: string;
  subjectSlug: SubjectSlug;
  title: string;
  revisionNumber: number;
  minutes: number;
}

export interface GenerateTodayPlanInput {
  date: string;

  /*
   * Safety buffer should already have
   * been removed from this capacity.
   */
  availableMinutes: number;

  chapters: EngineChapter[];

  /*
   * Yesterday / older missed chapters.
   * These receive priority, but don't
   * consume the entire day.
   */
  missedChapterIds?: string[];

  /*
   * At most one due/overdue revision
   * is supplied for the day.
   */
  dueRevision?: DueRevision | null;
}

export interface GenerateTodayPlanResult {
  tasks: GeneratedTask[];
  scheduledMinutes: number;
  unusedMinutes: number;
  subjectsTouched: SubjectSlug[];
  revisionScheduled: boolean;
}

/*
 * Lecture + Practice + PYQ are the
 * chapter's core study workload.
 *
 * Revision is handled separately.
 */
function hasCoreWork(
  chapter: EngineChapter,
): boolean {
  return (
    chapter.remainingLectureMinutes >
      0 ||
    chapter.practicePendingMinutes >
      0 ||
    chapter.pyqPendingMinutes >
      0
  );
}

/*
 * Recommended sequence applies only
 * to chapters which still have work.
 *
 * Random previously-studied chapters
 * are naturally skipped.
 */
function getNextChapter(
  chapters: EngineChapter[],
  subject: SubjectSlug,
): EngineChapter | null {
  return (
    chapters
      .filter(
        (chapter) =>
          chapter.subjectSlug ===
            subject &&
          hasCoreWork(
            chapter,
          ),
      )
      .sort(
        (a, b) =>
          a.sequenceOrder -
          b.sequenceOrder,
      )[0] ?? null
  );
}

/*
 * Inside an active chapter:
 *
 * Lecture
 *   ↓
 * Practice / DPP
 *   ↓
 * PYQ
 */
function getNextWork(
  chapter: EngineChapter,
) {
  if (
    chapter.remainingLectureMinutes >
    0
  ) {
    return {
      taskType:
        "lecture" as const,

      remainingMinutes:
        chapter.remainingLectureMinutes,

      maxMinutes:
        MAX_LECTURE,
    };
  }

  if (
    chapter.practicePendingMinutes >
    0
  ) {
    return {
      taskType:
        "practice" as const,

      remainingMinutes:
        chapter.practicePendingMinutes,

      maxMinutes:
        MAX_PRACTICE,
    };
  }

  if (
    chapter.pyqPendingMinutes >
    0
  ) {
    return {
      taskType:
        "pyq" as const,

      remainingMinutes:
        chapter.pyqPendingMinutes,

      maxMinutes:
        MAX_PYQ,
    };
  }

  return null;
}

export function generateTodayPlan(
  input: GenerateTodayPlanInput,
): GenerateTodayPlanResult {
  /*
   * --------------------------------------------
   * TOTAL USABLE TIME
   * --------------------------------------------
   */

  const available =
    Math.max(
      0,
      Math.floor(
        input.availableMinutes,
      ),
    );

  if (
    available <
    MIN_EMERGENCY_TASK
  ) {
    return {
      tasks: [],
      scheduledMinutes: 0,
      unusedMinutes:
        available,
      subjectsTouched: [],
      revisionScheduled:
        false,
    };
  }

  /*
   * --------------------------------------------
   * REVISION RESERVE
   * --------------------------------------------
   *
   * Very short day:
   * focus on core study.
   *
   * >= 90 usable minutes:
   * reserve up to 30 minutes for one
   * due/overdue revision.
   */

  const revisionMinutes =
    input.dueRevision &&
    available >= 90
      ? Math.min(
          MAX_REVISION,
          Math.max(
            MIN_EMERGENCY_TASK,
            input.dueRevision.minutes,
          ),
        )
      : 0;

  const coreAvailable =
    Math.max(
      0,
      available -
        revisionMinutes,
    );

  /*
   * --------------------------------------------
   * MISSED WORK
   * --------------------------------------------
   */

  const missed =
    new Set(
      input.missedChapterIds ??
        [],
    );

  /*
   * --------------------------------------------
   * ONE ACTIVE CANDIDATE PER SUBJECT
   * --------------------------------------------
   */

  const candidates =
    SUBJECTS.map(
      (subject) => {
        const chapter =
          getNextChapter(
            input.chapters,
            subject,
          );

        if (!chapter) {
          return null;
        }

        const work =
          getNextWork(
            chapter,
          );

        if (!work) {
          return null;
        }

        return {
          subject,
          chapter,
          work,

          missed:
            missed.has(
              chapter.chapterId,
            ),
        };
      },
    ).filter(
      (
        item,
      ): item is NonNullable<
        typeof item
      > => item !== null,
    );

  const tasks:
    GeneratedTask[] = [];

  /*
   * --------------------------------------------
   * SUBJECT COUNT
   * --------------------------------------------
   *
   * >= 60 core minutes:
   * try PCM all three.
   *
   * 35–59:
   * two subjects.
   *
   * <35:
   * one subject.
   */

  let subjectCount = 0;

  if (
    candidates.length > 0
  ) {
    subjectCount = 1;

    if (
      coreAvailable >= 60
    ) {
      subjectCount =
        Math.min(
          3,
          candidates.length,
        );
    } else if (
      coreAvailable >= 35
    ) {
      subjectCount =
        Math.min(
          2,
          candidates.length,
        );
    }
  }

  /*
   * Missed chapter gets first preference.
   *
   * Weightage only breaks ties.
   */
  candidates.sort(
    (a, b) => {
      if (
        a.missed !==
        b.missed
      ) {
        return a.missed
          ? -1
          : 1;
      }

      return (
        b.chapter.weightage -
        a.chapter.weightage
      );
    },
  );

  const selected =
    candidates.slice(
      0,
      subjectCount,
    );

  /*
   * Same date + same chapter +
   * same task-type can never occur twice.
   */
  const generatedKeys =
    new Set<string>();

  let remaining =
    coreAvailable;

  /*
   * --------------------------------------------
   * CORE PCM PASS
   * --------------------------------------------
   */

  for (
    let index = 0;
    index <
    selected.length;
    index++
  ) {
    const item =
      selected[index];

    const subjectsRemaining =
      selected.length -
      index;

    if (
      remaining <
      MIN_EMERGENCY_TASK
    ) {
      break;
    }

    /*
     * Fairly divide remaining core budget.
     */
    const fairShare =
      Math.floor(
        remaining /
          subjectsRemaining,
      );

    const minimum =
      coreAvailable >= 60
        ? MIN_EMERGENCY_TASK
        : MIN_NORMAL_TASK;

    let minutes =
      Math.min(
        fairShare,

        item.work.remainingMinutes,

        item.work.maxMinutes,
      );

    /*
     * Small remaining tail is allowed
     * if it is still useful.
     */
    if (
      minutes < minimum
    ) {
      if (
        item.work.remainingMinutes >=
        MIN_EMERGENCY_TASK
      ) {
        minutes =
          Math.min(
            item.work.remainingMinutes,
            fairShare,
          );
      } else {
        continue;
      }
    }

    if (
      minutes <
      MIN_EMERGENCY_TASK
    ) {
      continue;
    }

    const key =
      `${input.date}:${item.chapter.chapterId}:${item.work.taskType}`;

    if (
      generatedKeys.has(
        key,
      )
    ) {
      continue;
    }

    generatedKeys.add(
      key,
    );

    tasks.push({
      chapterId:
        item.chapter.chapterId,

      subjectSlug:
        item.subject,

      taskType:
        item.work.taskType,

      title:
        item.chapter.name,

      estimatedMinutes:
        minutes,

      scheduledDate:
        input.date,

      priority:
        item.missed
          ? 90
          : 70,
    });

    remaining -=
      minutes;
  }

  /*
   * --------------------------------------------
   * REVISION PASS
   * --------------------------------------------
   *
   * Max one revision per day for MVP.
   *
   * Revision is added only AFTER the
   * core PCM slots are protected.
   */

  let revisionScheduled =
    false;

  if (
    revisionMinutes >=
      MIN_EMERGENCY_TASK &&
    input.dueRevision
  ) {
    tasks.push({
      chapterId:
        input.dueRevision.chapterId,

      subjectSlug:
        input.dueRevision.subjectSlug,

      taskType:
        "revision",

      title:
        input.dueRevision.title,

      estimatedMinutes:
        revisionMinutes,

      scheduledDate:
        input.date,

      priority:
        60,

      revisionNumber:
        input.dueRevision.revisionNumber,
    });

    revisionScheduled =
      true;
  }

  /*
   * --------------------------------------------
   * FINAL SUMMARY
   * --------------------------------------------
   */

  const scheduledMinutes =
    tasks.reduce(
      (
        sum,
        task,
      ) =>
        sum +
        task.estimatedMinutes,
      0,
    );

  const subjectsTouched =
    Array.from(
      new Set(
        tasks
          .filter(
            (task) =>
              task.taskType !==
              "revision",
          )
          .map(
            (task) =>
              task.subjectSlug,
          ),
      ),
    ).filter(
      (
        subject,
      ): subject is SubjectSlug =>
        subject ===
          "physics" ||
        subject ===
          "chemistry" ||
        subject ===
          "maths",
    );

  return {
    tasks,

    scheduledMinutes,

    unusedMinutes:
      Math.max(
        0,
        available -
          scheduledMinutes,
      ),

    subjectsTouched,

    revisionScheduled,
  };
}
