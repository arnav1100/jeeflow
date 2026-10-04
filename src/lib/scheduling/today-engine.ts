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

export interface GenerateTodayPlanInput {
  date: string;
  availableMinutes: number;
  chapters: EngineChapter[];
  missedChapterIds?: string[];
}

export interface GenerateTodayPlanResult {
  tasks: GeneratedTask[];
  scheduledMinutes: number;
  unusedMinutes: number;
  subjectsTouched: SubjectSlug[];
}

function hasCoreWork(
  chapter: EngineChapter,
): boolean {
  return (
    chapter.remainingLectureMinutes > 0 ||
    chapter.practicePendingMinutes > 0 ||
    chapter.pyqPendingMinutes > 0
  );
}

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

function getNextWork(
  chapter: EngineChapter,
) {
  if (
    chapter.remainingLectureMinutes > 0
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
    chapter.practicePendingMinutes > 0
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
    chapter.pyqPendingMinutes > 0
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
  const available = Math.max(
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
      unusedMinutes: available,
      subjectsTouched: [],
    };
  }

  const missed =
    new Set(
      input.missedChapterIds ??
        [],
    );

  /*
   * Exactly ONE active candidate
   * per subject.
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

  if (
    candidates.length === 0
  ) {
    return {
      tasks: [],
      scheduledMinutes: 0,
      unusedMinutes: available,
      subjectsTouched: [],
    };
  }

  /*
   * ---------------------------------
   * HOW MANY SUBJECTS TODAY?
   * ---------------------------------
   *
   * 60m+:
   * try PCM all three.
   *
   * 35-59m:
   * try two subjects.
   *
   * <35m:
   * one useful task.
   */
  let subjectCount = 1;

  if (available >= 60) {
    subjectCount =
      Math.min(
        3,
        candidates.length,
      );
  } else if (
    available >= 35
  ) {
    subjectCount =
      Math.min(
        2,
        candidates.length,
      );
  }

  /*
   * Missed work gets first choice.
   *
   * Otherwise rotate using weightage
   * only as a tie-breaker.
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

  const tasks:
    GeneratedTask[] = [];

  /*
   * Hard duplicate protection.
   *
   * Same:
   * chapter + taskType + date
   *
   * can NEVER be generated twice.
   */
  const generatedKeys =
    new Set<string>();

  let remaining =
    available;

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
     * Fair split.
     *
     * Example 62 minutes:
     *
     * P ~20
     * C ~21
     * M ~21
     */
    const fairShare =
      Math.floor(
        remaining /
          subjectsRemaining,
      );

    const minimum =
      available >= 60
        ? MIN_EMERGENCY_TASK
        : MIN_NORMAL_TASK;

    let minutes =
      Math.min(
        fairShare,
        item.work.remainingMinutes,
        item.work.maxMinutes,
      );

    if (
      minutes < minimum
    ) {
      /*
       * If this subject has too little
       * actual work remaining, taking the
       * smaller tail is still useful.
       */
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
   * Do NOT make a second card for a
   * chapter already scheduled today.
   *
   * Extra time remains free for now.
   * Later this space can be used by
   * revision / PYQ / backlog intelligently.
   */
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
        tasks.map(
          (task) =>
            task.subjectSlug,
        ),
      ),
    ).filter(
      (
        subject,
      ): subject is SubjectSlug =>
        subject === "physics" ||
        subject === "chemistry" ||
        subject === "maths",
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
