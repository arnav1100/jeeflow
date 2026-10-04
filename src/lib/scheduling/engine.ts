import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";

import type {
  EngineChapter,
  FeasibilityResult,
  GeneratePlanInput,
  GeneratePlanResult,
  GeneratedRevision,
  GeneratedTask,
  Strategy,
  SubjectSlug,
} from "./types";

import {
  computeChapterPriority,
  emptyPoolReason,
  filterChaptersByStrategy,
} from "./priority";

const SUBJECTS: SubjectSlug[] = [
  "physics",
  "chemistry",
  "maths",
];

// Mon -> Sat main-subject rotation.
// Sunday = flexible catch-up day.
const MAIN_SUBJECT_BY_WEEKDAY: Record<
  number,
  SubjectSlug | null
> = {
  0: null,
  1: "physics",
  2: "chemistry",
  3: "maths",
  4: "physics",
  5: "chemistry",
  6: "maths",
};

const MAX_LECTURE_CHUNK = 120;
const MAX_PRACTICE_CHUNK = 90;
const MAX_PYQ_CHUNK = 150;
const MIN_USEFUL_CHUNK = 10;
const MAX_SEARCH_DAYS = 365;

interface WorkItem {
  chapter: EngineChapter;
  score: number;
  remainingLecture: number;
  remainingPractice: number;
  remainingPyq: number;
}

interface CalendarDay {
  date: string;
  weekday: number;
  capacity: number;
  testMinutes: number;
  testTitle?: string;
}

function isCoreStudyComplete(
  chapter: EngineChapter,
): boolean {
  return (
    chapter.remainingLectureMinutes === 0 &&
    chapter.practicePendingMinutes === 0 &&
    chapter.pyqPendingMinutes === 0
  );
}

function lectureMinutesFor(
  c: EngineChapter,
  strategy: Strategy,
): number {
  // Revision focus never schedules fresh lectures.
  return strategy === "revision_focus"
    ? 0
    : c.remainingLectureMinutes;
}

function estimateChapterTotalMinutes(
  c: EngineChapter,
  strategy: Strategy,
  revisionIntervalsCount: number,
  revisionMinutesPerSession: number,
): number {
  const revisionEstimate =
    c.revisionStatus === "done"
      ? 0
      : revisionIntervalsCount *
        revisionMinutesPerSession;

  return (
    lectureMinutesFor(c, strategy) +
    c.practicePendingMinutes +
    c.pyqPendingMinutes +
    revisionEstimate
  );
}

function buildCalendar(
  input: GeneratePlanInput,
  days: number,
): CalendarDay[] {
  const start = parseISO(input.startDate);

  const out: CalendarDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);

    const dateStr = format(
      date,
      "yyyy-MM-dd",
    );

    const weekday = date.getDay();

    const test = input.tests.find(
      (t) => t.date === dateStr,
    );

    const base =
      input.availabilityMinutesByWeekday[
        weekday
      ] ?? 0;

    const testMinutes = test
      ? test.durationMinutes +
        test.travelMinutes
      : 0;

    out.push({
      date: dateStr,
      weekday,
      capacity: Math.max(
        0,
        base - testMinutes,
      ),
      testMinutes,
      testTitle: test?.title,
    });
  }

  return out;
}

function windowDays(
  input: GeneratePlanInput,
): number {
  return (
    differenceInCalendarDays(
      parseISO(input.endDate),
      parseISO(input.startDate),
    ) + 1
  );
}

export function checkFeasibility(
  input: GeneratePlanInput,
): FeasibilityResult {
  const calendar = buildCalendar(
    input,
    windowDays(input),
  );

  const totalAvailable =
    calendar.reduce(
      (s, d) => s + d.capacity,
      0,
    );

  const pool =
    filterChaptersByStrategy(
      input.chapters,
      input.strategy,
      input.selectedBuckets,
      input.customChapterIds,
    );

  const totalRequired =
    pool.reduce(
      (sum, c) =>
        sum +
        estimateChapterTotalMinutes(
          c,
          input.strategy,
          input.revisionIntervalsDays
            .length,
          input.revisionMinutesPerSession,
        ),
      0,
    );

  let suggestedDays:
    | number
    | null = null;

  if (totalRequired === 0) {
    suggestedDays = 1;
  } else {
    const long = buildCalendar(
      input,
      MAX_SEARCH_DAYS,
    );

    let acc = 0;

    for (
      let i = 0;
      i < long.length;
      i++
    ) {
      acc += long[i].capacity;

      if (acc >= totalRequired) {
        const maxInterval =
          input.revisionIntervalsDays
            .length
            ? Math.max(
                ...input.revisionIntervalsDays,
              )
            : 0;

        suggestedDays = Math.min(
          MAX_SEARCH_DAYS,
          i +
            1 +
            Math.min(
              maxInterval,
              7,
            ),
        );

        break;
      }
    }
  }

  return {
    totalAvailableMinutes:
      totalAvailable,

    totalRequiredMinutes:
      totalRequired,

    feasible:
      totalRequired <=
      totalAvailable * 1.05,

    shortfallMinutes:
      Math.max(
        0,
        totalRequired -
          totalAvailable,
      ),

    suggestedDays,
  };
}

/*
 * Priority/prerequisite based ordering.
 *
 * Used for strategies where strict sequence
 * should NOT be forced.
 */
function orderWithPrerequisites(
  items: WorkItem[],
): WorkItem[] {
  const byId = new Map(
    items.map((i) => [
      i.chapter.chapterId,
      i,
    ]),
  );

  const placed =
    new Set<string>();

  const visiting =
    new Set<string>();

  const result: WorkItem[] = [];

  function place(
    item: WorkItem,
  ) {
    const id =
      item.chapter.chapterId;

    if (
      placed.has(id) ||
      visiting.has(id)
    ) {
      return;
    }

    visiting.add(id);

    if (
      item.chapter
        .prerequisiteChoice !==
      "already_know"
    ) {
      const prereqs =
        item.chapter.prerequisiteIds
          .map((pid) =>
            byId.get(pid),
          )
          .filter(
            (
              p,
            ): p is WorkItem =>
              Boolean(p),
          )
          .sort(
            (a, b) =>
              b.score -
              a.score,
          );

      for (const p of prereqs) {
        place(p);
      }
    }

    visiting.delete(id);
    placed.add(id);

    result.push(item);
  }

  for (const item of items) {
    place(item);
  }

  return result;
}

/**
 * Main deterministic planner.
 *
 * FULL SYLLABUS:
 *   Maths follows its fixed sequence.
 *   Physics follows its fixed sequence.
 *   Chemistry follows its fixed sequence.
 *
 * All three subjects still run in parallel.
 *
 * Other strategies retain priority based
 * behaviour.
 */
export function generateStudyPlan(
  input: GeneratePlanInput,
): GeneratePlanResult {
  const feasibility =
    checkFeasibility(input);

  const warnings: string[] = [];

  const trimmedChapterIds:
    string[] = [];

  let pool =
    filterChaptersByStrategy(
      input.chapters,
      input.strategy,
      input.selectedBuckets,
      input.customChapterIds,
    );

  /*
 * Study and revision are separate concerns.
 *
 * studyPool:
 * chapters that still need lecture/practice/PYQ.
 *
 * revisionPool:
 * chapters whose core study is finished but
 * whose spaced revisions are still pending.
 */
const revisionPool = input.chapters.filter(
  (chapter) =>
    isCoreStudyComplete(chapter) &&
    chapter.revisionStatus !== "done",
);

if (input.strategy === "full_syllabus") {
  pool = pool.filter(
    (chapter) =>
      !isCoreStudyComplete(chapter),
  );
}

  if (pool.length === 0) {
    return {
      feasibility,
      warnings,
      tasks: [],
      revisions: [],
      trimmedChapterIds,
      emptyReason:
        emptyPoolReason(
          input.strategy,
        ),
      scheduledMinutes: 0,
      revisionsDropped: 0,
    };
  }

  const nDays =
    windowDays(input);

  const calendar =
    buildCalendar(
      input,
      nDays,
    );

  const totalDays =
    nDays - 1;

  const completedPrereqs =
    new Set(
      input.chapters
        .filter(
          (c) =>
            c.status ===
            "completed",
        )
        .map(
          (c) =>
            c.chapterId,
        ),
    );

  const priorityCtx = {
    strategy: input.strategy,
    daysRemaining: totalDays,
    upcomingTestSyllabusChapterIds:
      input.upcomingTestSyllabusChapterIds ??
      new Set<string>(),
    completedPrerequisiteIds:
      completedPrereqs,
    today: input.startDate,
  };

  /*
   * If plan cannot fit, preserve the
   * existing trim behaviour.
   */
  if (!feasibility.feasible) {
    const neededH =
      Math.round(
        feasibility.totalRequiredMinutes /
          60,
      );

    const availH =
      Math.round(
        feasibility.totalAvailableMinutes /
          60,
      );

    warnings.push(
      `Your selected workload needs approximately ${neededH}h, but your schedule currently provides around ${availH}h in this window.`,
    );

    /*
     * Important:
     * For full syllabus we trim later
     * chapters rather than randomly taking
     * high-score chapters from deep inside
     * the chain.
     */
    if (
      input.strategy ===
      "full_syllabus"
    ) {
      const ordered = [
        ...pool,
      ].sort((a, b) => {
        if (
          a.sequenceOrder !==
          b.sequenceOrder
        ) {
          return (
            a.sequenceOrder -
            b.sequenceOrder
          );
        }

        return (
          b.weightage -
          a.weightage
        );
      });

      let budget =
        feasibility.totalAvailableMinutes;

      const kept:
        EngineChapter[] = [];

      /*
       * Keep the next chapters that can
       * reasonably fit.
       *
       * Subjects remain interleaved because
       * sequenceOrder is subject-local:
       * M1/P1/C1, M2/P2/C2...
       */
      for (const chapter of ordered) {
        const cost =
          estimateChapterTotalMinutes(
            chapter,
            input.strategy,
            input
              .revisionIntervalsDays
              .length,
            input.revisionMinutesPerSession,
          );

        if (
          cost <= budget ||
          kept.length === 0
        ) {
          kept.push(
            chapter,
          );

          budget -= cost;
        } else {
          trimmedChapterIds.push(
            chapter.chapterId,
          );
        }
      }

      pool = kept;
    } else {
      const scored =
        pool
          .map((c) => ({
            chapter: c,
            score:
              computeChapterPriority(
                c,
                priorityCtx,
              ),
          }))
          .sort(
            (a, b) =>
              b.score -
              a.score,
          );

      let budget =
        feasibility.totalAvailableMinutes;

      const kept:
        EngineChapter[] = [];

      for (const {
        chapter,
      } of scored) {
        const cost =
          estimateChapterTotalMinutes(
            chapter,
            input.strategy,
            input
              .revisionIntervalsDays
              .length,
            input.revisionMinutesPerSession,
          );

        if (
          cost <= budget ||
          kept.length === 0
        ) {
          kept.push(
            chapter,
          );

          budget -= cost;
        } else {
          trimmedChapterIds.push(
            chapter.chapterId,
          );
        }
      }

      pool = kept;
    }

    if (
      trimmedChapterIds.length >
      0
    ) {
      const extra =
        feasibility.suggestedDays
          ? ` Choose about ${feasibility.suggestedDays} days to fit everything.`
          : "";

      warnings.push(
        `${trimmedChapterIds.length} chapter${
          trimmedChapterIds.length >
          1
            ? "s"
            : ""
        } did not fit and were left out.${extra}`,
      );
    }
  }

  // ================================================
  // BUILD SUBJECT QUEUES
  // ================================================

  const queues: Record<
    SubjectSlug,
    WorkItem[]
  > = {
    physics: [],
    chemistry: [],
    maths: [],
  };

  for (const c of pool) {
    queues[
      c.subjectSlug
    ].push({
      chapter: c,

      score:
        computeChapterPriority(
          c,
          priorityCtx,
        ),

      remainingLecture:
        lectureMinutesFor(
          c,
          input.strategy,
        ),

      remainingPractice:
        c.practicePendingMinutes,

      remainingPyq:
        c.pyqPendingMinutes,
    });
  }

  /*
   * ==================================================
   * FIXED JEE SEQUENCE
   * ==================================================
   *
   * Full syllabus:
   *
   * Maths:
   * M1 -> M2 -> M3...
   *
   * Physics:
   * P1 -> P2 -> P3...
   *
   * Chemistry:
   * C1 -> C2 -> C3...
   *
   * Subjects run independently and in parallel.
   */
  const strictSequence =
    input.strategy ===
    "full_syllabus";

  for (const s of SUBJECTS) {
    if (strictSequence) {
      queues[s].sort(
        (a, b) =>
          a.chapter
            .sequenceOrder -
          b.chapter
            .sequenceOrder,
      );
    } else {
      queues[s].sort(
        (a, b) =>
          b.score -
          a.score,
      );

      queues[s] =
        orderWithPrerequisites(
          queues[s],
        );
    }
  }

  const pointers: Record<
    SubjectSlug,
    number
  > = {
    physics: 0,
    chemistry: 0,
    maths: 0,
  };

  const tasks:
    GeneratedTask[] = [];

  const used: Record<
    string,
    number
  > = {};

  const lastTaskDate: Record<
    string,
    string
  > = {};

  const subjectHasWork = (
    s: SubjectSlug,
  ) =>
    pointers[s] <
    queues[s].length;

  /*
   * Total work remaining for a subject,
   * not only the currently-active chapter.
   *
   * This gives Sunday/catch-up allocation
   * a better signal.
   */
  const remainingWork = (
    s: SubjectSlug,
  ) => {
    let total = 0;

    for (
      let i = pointers[s];
      i < queues[s].length;
      i++
    ) {
      const item =
        queues[s][i];

      total +=
        item.remainingLecture +
        item.remainingPractice +
        item.remainingPyq;
    }

    return total;
  };

  function allocateToSubject(
    subject: SubjectSlug,
    minutesIn: number,
    dateStr: string,
  ): number {
    let alloc = minutesIn;

    while (
      alloc >=
        MIN_USEFUL_CHUNK &&
      pointers[subject] <
        queues[subject].length
    ) {
      const item =
        queues[subject][
          pointers[subject]
        ];

      let taskType:
        | "lecture"
        | "practice"
        | "pyq"
        | null = null;

      let maxChunk = 0;
      let remainingRef = 0;

      if (
        item.remainingLecture >
        0
      ) {
        taskType =
          "lecture";

        maxChunk =
          MAX_LECTURE_CHUNK;

        remainingRef =
          item.remainingLecture;
      } else if (
        item.remainingPractice >
        0
      ) {
        taskType =
          "practice";

        maxChunk =
          MAX_PRACTICE_CHUNK;

        remainingRef =
          item.remainingPractice;
      } else if (
        item.remainingPyq >
        0
      ) {
        taskType = "pyq";

        maxChunk =
          MAX_PYQ_CHUNK;

        remainingRef =
          item.remainingPyq;
      }

      /*
       * Chapter fully scheduled.
       * Only now move to the next chapter
       * in this subject's chain.
       */
      if (!taskType) {
        pointers[subject] += 1;
        continue;
      }

      let chunk = Math.min(
        alloc,
        remainingRef,
        maxChunk,
      );

      /*
       * Avoid leaving tiny unusable tails.
       */
      if (
        remainingRef -
          chunk >
          0 &&
        remainingRef -
          chunk <
          MIN_USEFUL_CHUNK &&
        remainingRef <= alloc
      ) {
        chunk =
          remainingRef;
      }

      if (
        chunk <
          MIN_USEFUL_CHUNK &&
        chunk < remainingRef
      ) {
        break;
      }

      tasks.push({
        chapterId:
          item.chapter
            .chapterId,

        subjectSlug:
          subject,

        taskType,

        title:
          item.chapter.name,

        estimatedMinutes:
          chunk,

        scheduledDate:
          dateStr,

        priority:
          item.score,
      });

      used[dateStr] =
        (used[dateStr] ??
          0) + chunk;

      lastTaskDate[
        item.chapter.chapterId
      ] = dateStr;

      alloc -= chunk;

      if (
        taskType ===
        "lecture"
      ) {
        item.remainingLecture -=
          chunk;
      }

      if (
        taskType ===
        "practice"
      ) {
        item.remainingPractice -=
          chunk;
      }

      if (
        taskType === "pyq"
      ) {
        item.remainingPyq -=
          chunk;
      }
    }

    return alloc;
  }

  // ================================================
  // PASS 1: STUDY
  // ================================================

  const hasRevision =
    input.revisionIntervalsDays
      .length > 0;

  const reserveRatio =
    !hasRevision
      ? 0
      : input.strategy ===
          "revision_focus"
        ? 0.5
        : 0.2;

  for (const day of calendar) {
    /*
     * Fixed test.
     */
    if (
      day.testMinutes >
        0 &&
      day.testTitle
    ) {
      tasks.push({
        chapterId: null,
        subjectSlug:
          "general",
        taskType: "test",
        title:
          day.testTitle,
        estimatedMinutes:
          day.testMinutes,
        scheduledDate:
          day.date,
        priority: 100,
      });
    }

    const studyBudget =
      Math.floor(
        day.capacity *
          (1 -
            reserveRatio),
      );

    if (
      studyBudget <
      MIN_USEFUL_CHUNK
    ) {
      continue;
    }

    if (
      !SUBJECTS.some(
        subjectHasWork,
      )
    ) {
      continue;
    }

    let mainSubject =
      MAIN_SUBJECT_BY_WEEKDAY[
        day.weekday
      ];

    /*
     * Subjects with most pending work can
     * absorb free/catch-up time.
     */
    const byBacklog = [
      ...SUBJECTS,
    ].sort(
      (a, b) =>
        remainingWork(b) -
        remainingWork(a),
    );

    if (
      !mainSubject ||
      !subjectHasWork(
        mainSubject,
      )
    ) {
      mainSubject =
        byBacklog.find(
          (s) =>
            subjectHasWork(
              s,
            ),
        ) ??
        byBacklog[0];
    }

    const others =
      SUBJECTS.filter(
        (s) =>
          s !==
          mainSubject,
      ).sort(
        (a, b) =>
          remainingWork(b) -
          remainingWork(a),
      );

    const order = [
      mainSubject,
      ...others,
    ];

    /*
     * Rotating split:
     *
     * Main subject: 50%
     * Second:       30%
     * Third:        20%
     */
    const ratios = [
      0.5,
      0.3,
      0.2,
    ];

    let carry = 0;

    for (
      let idx = 0;
      idx < order.length;
      idx++
    ) {
      const subject =
        order[idx];

      const share =
        Math.round(
          studyBudget *
            ratios[idx],
        ) + carry;

      carry = 0;

      if (
        !subjectHasWork(
          subject,
        )
      ) {
        carry = share;
        continue;
      }

      carry =
        allocateToSubject(
          subject,
          share,
          day.date,
        );
    }

    /*
     * Give unused time to any subject
     * which still has work.
     */
    if (
      carry >=
      MIN_USEFUL_CHUNK
    ) {
      for (const subject of order) {
        if (
          !subjectHasWork(
            subject,
          )
        ) {
          continue;
        }

        carry =
          allocateToSubject(
            subject,
            carry,
            day.date,
          );

        if (
          carry <
          MIN_USEFUL_CHUNK
        ) {
          break;
        }
      }
    }
  }

    // ================================================
  // PASS 2: SPACED REVISION
  // ================================================
  //
  // Revision is independent from the study queue.
  //
  // This allows:
  //
  // Old chapter:
  // Lecture ✓ Practice ✓ PYQ ✓
  // Revision 1 ✓
  // Revision 2/3 pending
  //
  // while simultaneously:
  //
  // Next chapter:
  // Lecture / Practice / PYQ continues.
  // ================================================

  const revisions: GeneratedRevision[] = [];

  let revisionsDropped = 0;

  const capacityByDate = new Map(
    calendar.map((d) => [
      d.date,
      d.capacity,
    ]),
  );

  const sessionMin =
    input.revisionMinutesPerSession;

  type PendingRevision = {
    chapter: EngineChapter;
    revisionNumber: number;
    intervalDays: number;
    dueDate: string;
  };

  const pendingRevisions: PendingRevision[] = [];

  /*
   * Existing revision rows indexed by:
   *
   * chapterId:revisionNumber
   *
   * Example:
   * abc:R1 -> done
   * abc:R2 -> scheduled
   */
  const existingRevisionMap = new Map(
    (input.existingRevisions ?? []).map(
      (revision) => [
        `${revision.chapterId}:${revision.revisionNumber}`,
        revision,
      ],
    ),
  );

  /*
   * Chapters which may need revisions.
   *
   * Two sources:
   *
   * 1. revisionPool
   *    Core study was already completed before this plan.
   *
   * 2. queues
   *    Chapters being studied in this newly generated plan.
   */
  const revisionCandidates = new Map<
    string,
    EngineChapter
  >();

  for (const chapter of revisionPool) {
    revisionCandidates.set(
      chapter.chapterId,
      chapter,
    );
  }

  for (const subject of SUBJECTS) {
    for (const item of queues[subject]) {
      revisionCandidates.set(
        item.chapter.chapterId,
        item.chapter,
      );
    }
  }

  /*
   * Build revision requirements.
   */
  for (const chapter of revisionCandidates.values()) {
    if (
      chapter.revisionStatus === "done"
    ) {
      continue;
    }

    /*
     * For a chapter studied in this plan,
     * revisions start after its last study task.
     *
     * For an older core-complete chapter:
     * - existing revision due dates are preserved
     * - if no revision row exists yet, startDate
     *   acts as the fallback anchor.
     */
    const readyDate =
      lastTaskDate[chapter.chapterId] ??
      input.startDate;

    input.revisionIntervalsDays.forEach(
      (rawInterval, index) => {
        const revisionNumber =
          index + 1;

        const intervalDays =
          Math.max(
            1,
            rawInterval,
          );

        const key =
          `${chapter.chapterId}:${revisionNumber}`;

        const existing =
          existingRevisionMap.get(key);

        /*
         * A completed revision is history.
         *
         * Preserve it in the result but do NOT
         * create another revision task.
         */
        if (
          existing?.status === "done"
        ) {
          revisions.push({
            chapterId:
              chapter.chapterId,

            revisionNumber,

            intervalDays:
              existing.intervalDays,

            dueDate:
              existing.dueDate,

            status: "done",
          });

          return;
        }

        /*
         * Preserve an existing due date.
         *
         * This is important when a student
         * regenerates the planner: R2/R3 should
         * not restart their countdown.
         */
        const dueDate =
          existing?.dueDate ??
          format(
            addDays(
              parseISO(readyDate),
              intervalDays,
            ),
            "yyyy-MM-dd",
          );

        pendingRevisions.push({
          chapter,
          revisionNumber,
          intervalDays,
          dueDate,
        });
      },
    );
  }

  /*
   * Earlier revision first.
   * On the same date, R1 before R2 before R3.
   */
  pendingRevisions.sort(
    (a, b) => {
      if (
        a.dueDate ===
        b.dueDate
      ) {
        return (
          a.revisionNumber -
          b.revisionNumber
        );
      }

      return a.dueDate <
        b.dueDate
        ? -1
        : 1;
    },
  );

  /*
   * Place pending revisions into whatever
   * study capacity remains after normal study.
   */
  for (const revision of pendingRevisions) {
    let placedDate:
      | string
      | null = null;

    /*
     * If revision is already overdue, try
     * from today/startDate rather than looking
     * before the plan window.
     */
    const effectiveDueDate =
      revision.dueDate <
      input.startDate
        ? input.startDate
        : revision.dueDate;

    if (
      effectiveDueDate <=
      input.endDate
    ) {
      const startIndex =
        Math.max(
          0,
          differenceInCalendarDays(
            parseISO(
              effectiveDueDate,
            ),
            parseISO(
              input.startDate,
            ),
          ),
        );

      for (
        let i = startIndex;
        i < calendar.length;
        i++
      ) {
        const date =
          calendar[i].date;

        const freeMinutes =
          (capacityByDate.get(
            date,
          ) ?? 0) -
          (used[date] ?? 0);

        if (
          freeMinutes >=
          sessionMin
        ) {
          placedDate =
            date;

          break;
        }
      }
    }

    if (placedDate) {
      tasks.push({
        chapterId:
          revision.chapter.chapterId,

        subjectSlug:
          revision.chapter.subjectSlug,

        taskType:
          "revision",

        title:
          revision.chapter.name,

        estimatedMinutes:
          sessionMin,

        scheduledDate:
          placedDate,

        priority: 60,

        revisionNumber:
          revision.revisionNumber,
      });

      used[placedDate] =
        (used[placedDate] ?? 0) +
        sessionMin;

      revisions.push({
        chapterId:
          revision.chapter.chapterId,

        revisionNumber:
          revision.revisionNumber,

        intervalDays:
          revision.intervalDays,

        /*
         * Keep the real revision due date.
         *
         * scheduledDate belongs to the task.
         * dueDate belongs to the revision rule.
         */
        dueDate:
          revision.dueDate,

        status:
          "scheduled",
      });
    } else {
      /*
       * Keep future / currently unplaceable
       * revision in the revision schedule.
       */
      revisions.push({
        chapterId:
          revision.chapter.chapterId,

        revisionNumber:
          revision.revisionNumber,

        intervalDays:
          revision.intervalDays,

        dueDate:
          revision.dueDate,

        status:
          "pending",
      });

      if (
        revision.dueDate <=
        input.endDate
      ) {
        revisionsDropped += 1;
      }
    }
  }

  if (
    revisionsDropped > 0
  ) {
    warnings.push(
      `${revisionsDropped} revision session${
        revisionsDropped > 1
          ? "s"
          : ""
      } could not fit in your free time. A longer plan or lighter daily workload will give them room.`,
    );
  }

  const scheduledMinutes =
    tasks
      .filter(
        (t) =>
          t.taskType !==
          "test",
      )
      .reduce(
        (s, t) =>
          s +
          t.estimatedMinutes,
        0,
      );

  return {
    feasibility,
    warnings,
    tasks,
    revisions,
    trimmedChapterIds,
    emptyReason: null,
    scheduledMinutes,
    revisionsDropped,
  };
}
