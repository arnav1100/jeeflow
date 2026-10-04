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

/*
 * Daily task sizing.
 *
 * We deliberately keep sessions reasonably
 * small so the plan feels executable.
 */
const MIN_TASK_MINUTES = 25;

const TARGET_LECTURE_MINUTES = 60;
const MAX_LECTURE_MINUTES = 90;

const TARGET_PRACTICE_MINUTES = 45;
const MAX_PRACTICE_MINUTES = 60;

const TARGET_PYQ_MINUTES = 45;
const MAX_PYQ_MINUTES = 60;

export interface GenerateTodayPlanInput {
  date: string;

  /**
   * IMPORTANT:
   * This should already have safety/buffer removed.
   *
   * Example:
   * 155 raw minutes
   * -> 131 usable minutes
   */
  availableMinutes: number;

  chapters: EngineChapter[];

  /**
   * Subjects/chapters where yesterday's work
   * was missed can be boosted.
   *
   * Optional for now.
   */
  missedChapterIds?: string[];
}

export interface GenerateTodayPlanResult {
  tasks: GeneratedTask[];

  scheduledMinutes: number;

  unusedMinutes: number;

  subjectsTouched: SubjectSlug[];
}

/**
 * Core study means:
 *
 * Lecture
 * + Practice/DPP
 * + PYQ
 *
 * Revision is intentionally NOT included here.
 */
function hasCoreWork(
  chapter: EngineChapter,
): boolean {
  return (
    chapter.remainingLectureMinutes > 0 ||
    chapter.practicePendingMinutes > 0 ||
    chapter.pyqPendingMinutes > 0
  );
}

/**
 * Find the next chapter that still has core
 * work in this subject.
 *
 * Already studied random chapters are naturally
 * skipped.
 *
 * Example:
 *
 * Sets             ✓
 * Complex Numbers  pending
 * Quadratic        ✓
 * Matrices         pending
 *
 * -> Complex Numbers
 */
function getNextChapter(
  chapters: EngineChapter[],
  subject: SubjectSlug,
): EngineChapter | null {
  return (
    chapters
      .filter(
        (chapter) =>
          chapter.subjectSlug === subject &&
          hasCoreWork(chapter),
      )
      .sort(
        (a, b) =>
          a.sequenceOrder -
          b.sequenceOrder,
      )[0] ?? null
  );
}

/**
 * Determine what the student should do next
 * inside a chapter.
 *
 * Order:
 * Lecture -> Practice -> PYQ
 */
function getNextWork(
  chapter: EngineChapter,
): {
  taskType:
    | "lecture"
    | "practice"
    | "pyq";

  remainingMinutes: number;

  targetMinutes: number;

  maxMinutes: number;
} | null {
  if (
    chapter.remainingLectureMinutes > 0
  ) {
    return {
      taskType: "lecture",

      remainingMinutes:
        chapter.remainingLectureMinutes,

      targetMinutes:
        TARGET_LECTURE_MINUTES,

      maxMinutes:
        MAX_LECTURE_MINUTES,
    };
  }

  if (
    chapter.practicePendingMinutes > 0
  ) {
    return {
      taskType: "practice",

      remainingMinutes:
        chapter.practicePendingMinutes,

      targetMinutes:
        TARGET_PRACTICE_MINUTES,

      maxMinutes:
        MAX_PRACTICE_MINUTES,
    };
  }

  if (
    chapter.pyqPendingMinutes > 0
  ) {
    return {
      taskType: "pyq",

      remainingMinutes:
        chapter.pyqPendingMinutes,

      targetMinutes:
        TARGET_PYQ_MINUTES,

      maxMinutes:
        MAX_PYQ_MINUTES,
    };
  }

  return null;
}

/**
 * How many subjects should we try to touch today?
 *
 * >= 3h  -> all three
 * >= 2h  -> try all three with smaller blocks
 * >= 90m -> two
 * < 90m  -> one
 */
function desiredSubjectCount(
  availableMinutes: number,
): number {
  if (availableMinutes >= 120) {
    return 3;
  }

  if (availableMinutes >= 90) {
    return 2;
  }

  return 1;
}

/**
 * Build a single task.
 */
function makeTask({
  chapter,
  taskType,
  minutes,
  date,
  priority,
}: {
  chapter: EngineChapter;

  taskType:
    | "lecture"
    | "practice"
    | "pyq";

  minutes: number;

  date: string;

  priority: number;
}): GeneratedTask {
  return {
    chapterId:
      chapter.chapterId,

    subjectSlug:
      chapter.subjectSlug,

    taskType,

    title:
      chapter.name,

    estimatedMinutes:
      minutes,

    scheduledDate:
      date,

    priority,
  };
}

/**
 * Generates ONLY today's core study tasks.
 *
 * This engine intentionally does not:
 *
 * - create a 60/90-day daily timetable
 * - permanently trim chapters
 * - calculate scary total workload messages
 *
 * It only answers:
 *
 * "Given the student's progress and the time
 * available TODAY, what should they do now?"
 */
export function generateTodayPlan(
  input: GenerateTodayPlanInput,
): GenerateTodayPlanResult {
  const available =
    Math.max(
      0,
      Math.floor(
        input.availableMinutes,
      ),
    );

  if (
    available <
    MIN_TASK_MINUTES
  ) {
    return {
      tasks: [],
      scheduledMinutes: 0,
      unusedMinutes:
        available,
      subjectsTouched: [],
    };
  }

  const missedSet =
    new Set(
      input.missedChapterIds ??
        [],
    );

  /*
   * Get one active chapter for each subject.
   */
  const active = SUBJECTS.map(
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
          missedSet.has(
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

  if (active.length === 0) {
    return {
      tasks: [],
      scheduledMinutes: 0,
      unusedMinutes:
        available,
      subjectsTouched: [],
    };
  }

  /*
   * Yesterday's missed chapter gets priority,
   * but it does NOT consume the entire day.
   *
   * The other subjects should still get a chance.
   */
  active.sort(
    (a, b) => {
      if (
        a.missed !==
        b.missed
      ) {
        return a.missed
          ? -1
          : 1;
      }

      /*
       * Weak/high-value chapters can later
       * be included here.
       *
       * For now weightage acts only as a
       * tie-breaker.
       */
      return (
        b.chapter.weightage -
        a.chapter.weightage
      );
    },
  );

  const targetSubjects =
    Math.min(
      desiredSubjectCount(
        available,
      ),
      active.length,
    );

  const selected =
    active.slice(
      0,
      targetSubjects,
    );

  const tasks:
    GeneratedTask[] = [];

  let remaining =
    available;

  /*
   * PASS 1
   *
   * Touch selected subjects once.
   *
   * This prevents:
   *
   * Kinematics 72m
   * Kinematics 72m
   *
   * while Chemistry/Maths get nothing.
   */
  for (
    let i = 0;
    i < selected.length;
    i++
  ) {
    const item =
      selected[i];

    const subjectsStill =
      selected.length -
      i;

    /*
     * Reserve enough time so remaining
     * subjects can still get a useful block.
     */
    const reserveForOthers =
      (subjectsStill - 1) *
      MIN_TASK_MINUTES;

    const maxAvailableNow =
      Math.max(
        0,
        remaining -
          reserveForOthers,
      );

    if (
      maxAvailableNow <
      MIN_TASK_MINUTES
    ) {
      continue;
    }

    /*
     * Fair share of currently remaining time.
     */
    const fairShare =
      Math.floor(
        remaining /
          subjectsStill,
      );

    let minutes =
      Math.min(
        item.work.remainingMinutes,

        item.work.maxMinutes,

        Math.max(
          MIN_TASK_MINUTES,
          Math.min(
            item.work.targetMinutes,
            fairShare,
          ),
        ),

        maxAvailableNow,
      );

    /*
     * If the entire remaining piece of this work
     * is only slightly larger, finish it rather
     * than leave a tiny tail.
     */
    const tail =
      item.work.remainingMinutes -
      minutes;

    if (
      tail > 0 &&
      tail <
        MIN_TASK_MINUTES &&
      item.work.remainingMinutes <=
        maxAvailableNow
    ) {
      minutes =
        item.work.remainingMinutes;
    }

    if (
      minutes <
      MIN_TASK_MINUTES
    ) {
      continue;
    }

    tasks.push(
      makeTask({
        chapter:
          item.chapter,

        taskType:
          item.work.taskType,

        minutes,

        date:
          input.date,

        priority:
          item.missed
            ? 90
            : 70,
      }),
    );

    remaining -=
      minutes;
  }

  /*
   * PASS 2
   *
   * Use leftover time without creating duplicate
   * same chapter + same task-type cards.
   *
   * We may advance to another subject/chapter
   * later, but for MVP unused time is safer than
   * generating repetitive/overloaded tasks.
   */
  if (
    remaining >=
    MIN_TASK_MINUTES
  ) {
    const alreadyScheduled =
      new Set(
        tasks.map(
          (task) =>
            `${task.chapterId}:${task.taskType}`,
        ),
      );

    for (const item of active) {
      if (
        remaining <
        MIN_TASK_MINUTES
      ) {
        break;
      }

      const key =
        `${item.chapter.chapterId}:${item.work.taskType}`;

      if (
        alreadyScheduled.has(
          key,
        )
      ) {
        continue;
      }

      const minutes =
        Math.min(
          remaining,

          item.work.remainingMinutes,

          item.work.maxMinutes,
        );

      if (
        minutes <
        MIN_TASK_MINUTES
      ) {
        continue;
      }

      tasks.push(
        makeTask({
          chapter:
            item.chapter,

          taskType:
            item.work.taskType,

          minutes,

          date:
            input.date,

          priority:
            item.missed
              ? 85
              : 65,
        }),
      );

      alreadyScheduled.add(
        key,
      );

      remaining -=
        minutes;
    }
  }

  const scheduledMinutes =
    tasks.reduce(
      (sum, task) =>
        sum +
        task.estimatedMinutes,
      0,
    );

  const subjectsTouched =
    Array.from(
      new Set(
        tasks
          .map(
            (task) =>
              task.subjectSlug,
          )
          .filter(
            (
              subject,
            ): subject is SubjectSlug =>
              subject !==
              "general",
          ),
      ),
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
  };
}
