import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type {
  EngineChapter,
  FeasibilityResult,
  GeneratePlanInput,
  GeneratePlanResult,
  GeneratedRevision,
  GeneratedTask,
  SubjectSlug,
} from "./types";
import { computeChapterPriority, filterChaptersByStrategy } from "./priority";

const SUBJECTS: SubjectSlug[] = ["physics", "chemistry", "maths"];

// Default Mon->Sat main-subject rotation from the spec. Sunday is treated as a
// flexible catch-up day driven by whichever subject has the most backlog.
const MAIN_SUBJECT_BY_WEEKDAY: Record<number, SubjectSlug | null> = {
  0: null, // Sunday
  1: "physics",
  2: "chemistry",
  3: "maths",
  4: "physics",
  5: "chemistry",
  6: "maths",
};

const MAX_LECTURE_CHUNK = 120; // minutes
const MAX_PRACTICE_CHUNK = 90;
const MAX_PYQ_CHUNK = 150;
const MIN_USEFUL_CHUNK = 10; // don't schedule micro fragments

interface WorkItem {
  chapter: EngineChapter;
  score: number;
  remainingLecture: number;
  remainingPractice: number;
  remainingPyq: number;
}

function buildCompletedPrereqSet(allChapters: EngineChapter[]): Set<string> {
  const completed = new Set<string>();
  for (const c of allChapters) {
    if (c.status === "completed") completed.add(c.chapterId);
  }
  return completed;
}

/** Estimates total required minutes for a chapter including a rough revision allowance. */
function estimateChapterTotalMinutes(
  c: EngineChapter,
  revisionIntervalsCount: number,
  revisionMinutesPerSession: number,
): number {
  const revisionEstimate = c.revisionStatus === "done" ? 0 : revisionIntervalsCount * revisionMinutesPerSession;
  return c.remainingLectureMinutes + c.practicePendingMinutes + c.pyqPendingMinutes + revisionEstimate;
}

export function checkFeasibility(input: GeneratePlanInput): FeasibilityResult {
  const days = differenceInCalendarDays(parseISO(input.endDate), parseISO(input.startDate)) + 1;
  let totalAvailable = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(parseISO(input.startDate), i);
    const weekday = date.getDay();
    const dateStr = format(date, "yyyy-MM-dd");
    const test = input.tests.find((t) => t.date === dateStr);
    let minutes = input.availabilityMinutesByWeekday[weekday] ?? 0;
    if (test) minutes = Math.max(0, minutes - test.durationMinutes - test.travelMinutes);
    totalAvailable += minutes;
  }

  const pool = filterChaptersByStrategy(
    input.chapters,
    input.strategy,
    input.selectedBuckets,
    input.customChapterIds,
  );
  const totalRequired = pool.reduce(
    (sum, c) => sum + estimateChapterTotalMinutes(c, input.revisionIntervalsDays.length, input.revisionMinutesPerSession),
    0,
  );

  return {
    totalAvailableMinutes: totalAvailable,
    totalRequiredMinutes: totalRequired,
    feasible: totalRequired <= totalAvailable * 1.05,
    shortfallMinutes: Math.max(0, totalRequired - totalAvailable),
  };
}

/**
 * Core deterministic scheduling engine.
 *
 * High level approach (two passes):
 *  PASS 1 — Walk the plan day by day. Each day's available minutes are split
 *    across a rotating "main / second / third" subject so Physics, Chemistry
 *    and Maths always progress in parallel (never ignoring a subject for
 *    multiple days). Within a subject, chapters are consumed strictly in
 *    priority order and only one chapter is "active" at a time — we fully
 *    allocate its remaining Lecture -> Practice/DPP -> PYQ minutes (chunked
 *    into realistic session lengths) before opening the next chapter.
 *  PASS 2 — Once a chapter's lecture+practice+pyq minutes are fully
 *    allocated we know its "study ready" date, so we project forward spaced
 *    revision sessions (default +3 / +7 / +15 days) and schedule them as
 *    lightweight tasks, provided they land inside the plan window.
 */
export function generateStudyPlan(input: GeneratePlanInput): GeneratePlanResult {
  const feasibility = checkFeasibility(input);
  const warnings: string[] = [];
  const trimmedChapterIds: string[] = [];

  let pool = filterChaptersByStrategy(input.chapters, input.strategy, input.selectedBuckets, input.customChapterIds);

  if (!feasibility.feasible) {
    const neededH = Math.round(feasibility.totalRequiredMinutes / 60);
    const availH = Math.round(feasibility.totalAvailableMinutes / 60);
    warnings.push(
      `Your selected workload needs approximately ${neededH}h, but your schedule currently provides around ${availH}h in this window.`,
    );

    // Best-effort trim: keep the highest priority chapters that fit inside the
    // available time instead of silently generating an impossible schedule.
    const completedPrereqs = buildCompletedPrereqSet(input.chapters);
    const scored = pool
      .map((c) => ({
        chapter: c,
        score: computeChapterPriority(c, {
          strategy: input.strategy,
          daysRemaining: differenceInCalendarDays(parseISO(input.endDate), parseISO(input.startDate)),
          upcomingTestSyllabusChapterIds: input.upcomingTestSyllabusChapterIds ?? new Set(),
          completedPrerequisiteIds: completedPrereqs,
          today: input.startDate,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    let budget = feasibility.totalAvailableMinutes;
    const kept: EngineChapter[] = [];
    for (const { chapter } of scored) {
      const cost = estimateChapterTotalMinutes(chapter, input.revisionIntervalsDays.length, input.revisionMinutesPerSession);
      if (cost <= budget || kept.length === 0) {
        kept.push(chapter);
        budget -= cost;
      } else {
        trimmedChapterIds.push(chapter.chapterId);
      }
    }
    pool = kept;
  }

  // ---------- Build per-subject priority queues ----------
  const completedPrereqs = buildCompletedPrereqSet(input.chapters);
  const totalDays = differenceInCalendarDays(parseISO(input.endDate), parseISO(input.startDate));

  const queues: Record<SubjectSlug, WorkItem[]> = { physics: [], chemistry: [], maths: [] };
  for (const c of pool) {
    const score = computeChapterPriority(c, {
      strategy: input.strategy,
      daysRemaining: totalDays,
      upcomingTestSyllabusChapterIds: input.upcomingTestSyllabusChapterIds ?? new Set(),
      completedPrerequisiteIds: completedPrereqs,
      today: input.startDate,
    });
    queues[c.subjectSlug].push({
      chapter: c,
      score,
      remainingLecture: c.remainingLectureMinutes,
      remainingPractice: c.practicePendingMinutes,
      remainingPyq: c.pyqPendingMinutes,
    });
  }
  for (const s of SUBJECTS) queues[s].sort((a, b) => b.score - a.score);
  const pointers: Record<SubjectSlug, number> = { physics: 0, chemistry: 0, maths: 0 };

  const tasks: GeneratedTask[] = [];
  const studyReadyDates: Record<string, string> = {}; // chapterId -> date

  const subjectHasWork = (s: SubjectSlug) => pointers[s] < queues[s].length;

  function allocateToSubject(subject: SubjectSlug, minutesIn: number, dateStr: string): number {
    let alloc = minutesIn;
    while (alloc >= MIN_USEFUL_CHUNK && pointers[subject] < queues[subject].length) {
      const item = queues[subject][pointers[subject]];

      let taskType: "lecture" | "practice" | "pyq" | null = null;
      let maxChunk = 0;
      let remainingRef = 0;
      if (item.remainingLecture > 0) {
        taskType = "lecture";
        maxChunk = MAX_LECTURE_CHUNK;
        remainingRef = item.remainingLecture;
      } else if (item.remainingPractice > 0) {
        taskType = "practice";
        maxChunk = MAX_PRACTICE_CHUNK;
        remainingRef = item.remainingPractice;
      } else if (item.remainingPyq > 0) {
        taskType = "pyq";
        maxChunk = MAX_PYQ_CHUNK;
        remainingRef = item.remainingPyq;
      }

      if (!taskType) {
        // Chapter fully scheduled — mark study-ready and advance to next chapter.
        studyReadyDates[item.chapter.chapterId] = dateStr;
        pointers[subject] += 1;
        continue;
      }

      const chunk = Math.min(alloc, remainingRef, maxChunk);
      if (chunk < MIN_USEFUL_CHUNK) break;

      tasks.push({
        chapterId: item.chapter.chapterId,
        subjectSlug: subject,
        taskType,
        title: item.chapter.name,
        estimatedMinutes: chunk,
        scheduledDate: dateStr,
        priority: item.score,
      });

      alloc -= chunk;
      if (taskType === "lecture") item.remainingLecture -= chunk;
      if (taskType === "practice") item.remainingPractice -= chunk;
      if (taskType === "pyq") item.remainingPyq -= chunk;
    }
    return alloc; // leftover, unused minutes
  }

  // ---------- PASS 1: walk the calendar ----------
  const dayCount = totalDays + 1;
  for (let i = 0; i < dayCount; i++) {
    const date = addDays(parseISO(input.startDate), i);
    const weekday = date.getDay();
    const dateStr = format(date, "yyyy-MM-dd");

    const test = input.tests.find((t) => t.date === dateStr);
    let dayMinutes = input.availabilityMinutesByWeekday[weekday] ?? 0;

    if (test) {
      const blocked = test.durationMinutes + test.travelMinutes;
      dayMinutes = Math.max(0, dayMinutes - blocked);
      tasks.push({
        chapterId: null,
        subjectSlug: "general",
        taskType: "test",
        title: test.title,
        estimatedMinutes: blocked,
        scheduledDate: dateStr,
        priority: 100,
      });
    }

    if (dayMinutes < MIN_USEFUL_CHUNK) continue;

    // Decide today's main / second / third subject ordering.
    let mainSubject = MAIN_SUBJECT_BY_WEEKDAY[weekday];
    const remainingWork = (s: SubjectSlug) => {
      const item = queues[s][pointers[s]];
      if (!item) return 0;
      return item.remainingLecture + item.remainingPractice + item.remainingPyq;
    };
    const bySubjectBacklog = [...SUBJECTS].sort((a, b) => remainingWork(b) - remainingWork(a));
    if (!mainSubject || !subjectHasWork(mainSubject)) {
      mainSubject = bySubjectBacklog.find((s) => subjectHasWork(s)) ?? bySubjectBacklog[0];
    }
    const others = SUBJECTS.filter((s) => s !== mainSubject).sort((a, b) => remainingWork(b) - remainingWork(a));
    const order = [mainSubject, ...others];

    const ratios = [0.5, 0.3, 0.2];
    let carry = 0;
    for (let idx = 0; idx < order.length; idx++) {
      const subject = order[idx];
      const share = Math.round(dayMinutes * ratios[idx]) + carry;
      carry = 0;
      if (!subjectHasWork(subject)) {
        carry = share; // give unused share to the next subject in line
        continue;
      }
      const leftover = allocateToSubject(subject, share, dateStr);
      carry = leftover;
    }
    // Final pass: if minutes still remain (e.g. two subjects finished), push
    // whatever's left into any subject that still has pending work.
    if (carry >= MIN_USEFUL_CHUNK) {
      for (const subject of order) {
        if (!subjectHasWork(subject)) continue;
        carry = allocateToSubject(subject, carry, dateStr);
        if (carry < MIN_USEFUL_CHUNK) break;
      }
    }
  }

  // ---------- PASS 2: project spaced revisions off study-ready dates ----------
  const revisions: GeneratedRevision[] = [];
  for (const [chapterId, readyDateStr] of Object.entries(studyReadyDates)) {
    const chapter = pool.find((c) => c.chapterId === chapterId);
    if (!chapter || chapter.revisionStatus === "done") continue;
    input.revisionIntervalsDays.forEach((intervalDays, idx) => {
      const dueDate = format(addDays(parseISO(readyDateStr), intervalDays), "yyyy-MM-dd");
      revisions.push({ chapterId, revisionNumber: idx + 1, intervalDays, dueDate });
      if (dueDate <= input.endDate) {
        tasks.push({
          chapterId,
          subjectSlug: chapter.subjectSlug,
          taskType: "revision",
          title: chapter.name,
          estimatedMinutes: input.revisionMinutesPerSession,
          scheduledDate: dueDate,
          priority: 60,
          revisionNumber: idx + 1,
        });
      }
    });
  }

  return { feasibility, warnings, tasks, revisions, trimmedChapterIds };
}
