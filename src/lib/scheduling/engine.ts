import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
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
import { computeChapterPriority, emptyPoolReason, filterChaptersByStrategy } from "./priority";

const SUBJECTS: SubjectSlug[] = ["physics", "chemistry", "maths"];

// Mon->Sat main-subject rotation. Sunday is a flexible catch-up day driven by
// whichever subject has the most work left.
const MAIN_SUBJECT_BY_WEEKDAY: Record<number, SubjectSlug | null> = {
  0: null,
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
  capacity: number; // study minutes available after blocking tests
  testMinutes: number;
  testTitle?: string;
}

function lectureMinutesFor(c: EngineChapter, strategy: Strategy): number {
  // Revision focus never schedules fresh lectures.
  return strategy === "revision_focus" ? 0 : c.remainingLectureMinutes;
}

function estimateChapterTotalMinutes(
  c: EngineChapter,
  strategy: Strategy,
  revisionIntervalsCount: number,
  revisionMinutesPerSession: number,
): number {
  const revisionEstimate = c.revisionStatus === "done" ? 0 : revisionIntervalsCount * revisionMinutesPerSession;
  return lectureMinutesFor(c, strategy) + c.practicePendingMinutes + c.pyqPendingMinutes + revisionEstimate;
}

function buildCalendar(input: GeneratePlanInput, days: number): CalendarDay[] {
  const start = parseISO(input.startDate);
  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dateStr = format(date, "yyyy-MM-dd");
    const weekday = date.getDay();
    const test = input.tests.find((t) => t.date === dateStr);
    const base = input.availabilityMinutesByWeekday[weekday] ?? 0;
    const testMinutes = test ? test.durationMinutes + test.travelMinutes : 0;
    out.push({
      date: dateStr,
      weekday,
      capacity: Math.max(0, base - testMinutes),
      testMinutes,
      testTitle: test?.title,
    });
  }
  return out;
}

function windowDays(input: GeneratePlanInput): number {
  return differenceInCalendarDays(parseISO(input.endDate), parseISO(input.startDate)) + 1;
}

export function checkFeasibility(input: GeneratePlanInput): FeasibilityResult {
  const calendar = buildCalendar(input, windowDays(input));
  const totalAvailable = calendar.reduce((s, d) => s + d.capacity, 0);

  const pool = filterChaptersByStrategy(input.chapters, input.strategy, input.selectedBuckets, input.customChapterIds);
  const totalRequired = pool.reduce(
    (sum, c) =>
      sum + estimateChapterTotalMinutes(c, input.strategy, input.revisionIntervalsDays.length, input.revisionMinutesPerSession),
    0,
  );

  // How many days would the whole selection need? Walk forward day by day.
  let suggestedDays: number | null = null;
  if (totalRequired === 0) {
    suggestedDays = 1;
  } else {
    const long = buildCalendar(input, MAX_SEARCH_DAYS);
    let acc = 0;
    for (let i = 0; i < long.length; i++) {
      acc += long[i].capacity;
      if (acc >= totalRequired) {
        // small buffer so the last chapters' spaced revisions can still land
        const maxInterval = input.revisionIntervalsDays.length ? Math.max(...input.revisionIntervalsDays) : 0;
        suggestedDays = Math.min(MAX_SEARCH_DAYS, i + 1 + Math.min(maxInterval, 7));
        break;
      }
    }
  }

  return {
    totalAvailableMinutes: totalAvailable,
    totalRequiredMinutes: totalRequired,
    feasible: totalRequired <= totalAvailable * 1.05,
    shortfallMinutes: Math.max(0, totalRequired - totalAvailable),
    suggestedDays,
  };
}

/** Orders a subject queue by score, but never before the chapter's own prerequisites (when they're in the same queue). */
function orderWithPrerequisites(items: WorkItem[]): WorkItem[] {
  const byId = new Map(items.map((i) => [i.chapter.chapterId, i]));
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const result: WorkItem[] = [];

  function place(item: WorkItem) {
    const id = item.chapter.chapterId;
    if (placed.has(id) || visiting.has(id)) return;
    visiting.add(id);
    // Student said they already know the prerequisites -> don't force them first.
    if (item.chapter.prerequisiteChoice !== "already_know") {
      const prereqs = item.chapter.prerequisiteIds
        .map((pid) => byId.get(pid))
        .filter((p): p is WorkItem => Boolean(p))
        .sort((a, b) => b.score - a.score);
      for (const p of prereqs) place(p);
    }
    visiting.delete(id);
    placed.add(id);
    result.push(item);
  }

  for (const item of items) place(item);
  return result;
}

/**
 * Deterministic scheduling engine.
 *
 *  1. Pool        — strategy decides which chapters are in. Empty pool => emptyReason (nothing is overwritten).
 *  2. Fit         — if the pool needs more time than the window offers, keep the highest priority chapters.
 *  3. Study pass  — day by day, split study time across Physics / Chemistry / Maths (50/30/20 rotating).
 *                   Per subject, chapters go in priority order but never before their prerequisites, one
 *                   active chapter at a time: Lecture -> Practice/DPP -> PYQ.
 *                   A slice of every day (20%, 50% for revision focus) is reserved for revision.
 *  4. Revision    — spaced revisions (default +3/+7/+15 days after the chapter is study-ready) are placed on the
 *                   first day on/after the due date that still has free time, so they never overload a day or
 *                   land on a day off.
 */
export function generateStudyPlan(input: GeneratePlanInput): GeneratePlanResult {
  const feasibility = checkFeasibility(input);
  const warnings: string[] = [];
  const trimmedChapterIds: string[] = [];

  let pool = filterChaptersByStrategy(input.chapters, input.strategy, input.selectedBuckets, input.customChapterIds);

  if (pool.length === 0) {
    return {
      feasibility,
      warnings,
      tasks: [],
      revisions: [],
      trimmedChapterIds,
      emptyReason: emptyPoolReason(input.strategy),
      scheduledMinutes: 0,
      revisionsDropped: 0,
    };
  }

  const nDays = windowDays(input);
  const calendar = buildCalendar(input, nDays);
  const totalDays = nDays - 1;
  const completedPrereqs = new Set(input.chapters.filter((c) => c.status === "completed").map((c) => c.chapterId));
  const priorityCtx = {
    strategy: input.strategy,
    daysRemaining: totalDays,
    upcomingTestSyllabusChapterIds: input.upcomingTestSyllabusChapterIds ?? new Set<string>(),
    completedPrerequisiteIds: completedPrereqs,
    today: input.startDate,
  };

  if (!feasibility.feasible) {
    const neededH = Math.round(feasibility.totalRequiredMinutes / 60);
    const availH = Math.round(feasibility.totalAvailableMinutes / 60);
    warnings.push(
      `Your selected workload needs approximately ${neededH}h, but your schedule currently provides around ${availH}h in this window.`,
    );

    const scored = pool
      .map((c) => ({ chapter: c, score: computeChapterPriority(c, priorityCtx) }))
      .sort((a, b) => b.score - a.score);

    let budget = feasibility.totalAvailableMinutes;
    const kept: EngineChapter[] = [];
    for (const { chapter } of scored) {
      const cost = estimateChapterTotalMinutes(
        chapter,
        input.strategy,
        input.revisionIntervalsDays.length,
        input.revisionMinutesPerSession,
      );
      if (cost <= budget || kept.length === 0) {
        kept.push(chapter);
        budget -= cost;
      } else {
        trimmedChapterIds.push(chapter.chapterId);
      }
    }
    pool = kept;

    if (trimmedChapterIds.length > 0) {
      const extra = feasibility.suggestedDays ? ` Choose about ${feasibility.suggestedDays} days to fit everything.` : "";
      warnings.push(
        `${trimmedChapterIds.length} lower-priority chapter${trimmedChapterIds.length > 1 ? "s" : ""} did not fit and were left out.${extra}`,
      );
    }
  }

  // ---------- Per-subject queues ----------
  const queues: Record<SubjectSlug, WorkItem[]> = { physics: [], chemistry: [], maths: [] };
  for (const c of pool) {
    queues[c.subjectSlug].push({
      chapter: c,
      score: computeChapterPriority(c, priorityCtx),
      remainingLecture: lectureMinutesFor(c, input.strategy),
      remainingPractice: c.practicePendingMinutes,
      remainingPyq: c.pyqPendingMinutes,
    });
  }
  for (const s of SUBJECTS) {
    queues[s].sort((a, b) => b.score - a.score);
    queues[s] = orderWithPrerequisites(queues[s]);
  }
  const pointers: Record<SubjectSlug, number> = { physics: 0, chemistry: 0, maths: 0 };

  const tasks: GeneratedTask[] = [];
  const used: Record<string, number> = {}; // date -> minutes already planned
  const lastTaskDate: Record<string, string> = {}; // chapterId -> last study task date

  const subjectHasWork = (s: SubjectSlug) => pointers[s] < queues[s].length;
  const remainingWork = (s: SubjectSlug) => {
    const item = queues[s][pointers[s]];
    return item ? item.remainingLecture + item.remainingPractice + item.remainingPyq : 0;
  };

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
        pointers[subject] += 1; // chapter fully scheduled
        continue;
      }

      // Avoid leaving a tiny tail: if what's left after this chunk would be
      // under the minimum, take it all now when it fits.
      let chunk = Math.min(alloc, remainingRef, maxChunk);
      if (remainingRef - chunk > 0 && remainingRef - chunk < MIN_USEFUL_CHUNK && remainingRef <= alloc) chunk = remainingRef;
      if (chunk < MIN_USEFUL_CHUNK && chunk < remainingRef) break;

      tasks.push({
        chapterId: item.chapter.chapterId,
        subjectSlug: subject,
        taskType,
        title: item.chapter.name,
        estimatedMinutes: chunk,
        scheduledDate: dateStr,
        priority: item.score,
      });
      used[dateStr] = (used[dateStr] ?? 0) + chunk;
      lastTaskDate[item.chapter.chapterId] = dateStr;

      alloc -= chunk;
      if (taskType === "lecture") item.remainingLecture -= chunk;
      if (taskType === "practice") item.remainingPractice -= chunk;
      if (taskType === "pyq") item.remainingPyq -= chunk;
    }
    return alloc;
  }

  // ---------- PASS 1: study ----------
  const hasRevision = input.revisionIntervalsDays.length > 0;
  const reserveRatio = !hasRevision ? 0 : input.strategy === "revision_focus" ? 0.5 : 0.2;

  for (const day of calendar) {
    if (day.testMinutes > 0 && day.testTitle) {
      tasks.push({
        chapterId: null,
        subjectSlug: "general",
        taskType: "test",
        title: day.testTitle,
        estimatedMinutes: day.testMinutes,
        scheduledDate: day.date,
        priority: 100,
      });
    }

    const studyBudget = Math.floor(day.capacity * (1 - reserveRatio));
    if (studyBudget < MIN_USEFUL_CHUNK) continue;
    if (!SUBJECTS.some(subjectHasWork)) continue;

    let mainSubject = MAIN_SUBJECT_BY_WEEKDAY[day.weekday];
    const byBacklog = [...SUBJECTS].sort((a, b) => remainingWork(b) - remainingWork(a));
    if (!mainSubject || !subjectHasWork(mainSubject)) {
      mainSubject = byBacklog.find((s) => subjectHasWork(s)) ?? byBacklog[0];
    }
    const others = SUBJECTS.filter((s) => s !== mainSubject).sort((a, b) => remainingWork(b) - remainingWork(a));
    const order = [mainSubject, ...others];

    const ratios = [0.5, 0.3, 0.2];
    let carry = 0;
    for (let idx = 0; idx < order.length; idx++) {
      const subject = order[idx];
      const share = Math.round(studyBudget * ratios[idx]) + carry;
      carry = 0;
      if (!subjectHasWork(subject)) {
        carry = share;
        continue;
      }
      carry = allocateToSubject(subject, share, day.date);
    }
    if (carry >= MIN_USEFUL_CHUNK) {
      for (const subject of order) {
        if (!subjectHasWork(subject)) continue;
        carry = allocateToSubject(subject, carry, day.date);
        if (carry < MIN_USEFUL_CHUNK) break;
      }
    }
  }

  // ---------- PASS 2: spaced revision ----------
  const revisions: GeneratedRevision[] = [];
  let revisionsDropped = 0;
  const capacityByDate = new Map(calendar.map((d) => [d.date, d.capacity]));
  const sessionMin = input.revisionMinutesPerSession;

  type Pending = { chapter: EngineChapter; n: number; interval: number; due: string };
  const pending: Pending[] = [];
  const scheduledChapterIds = new Set<string>();
  for (const s of SUBJECTS) for (const item of queues[s]) scheduledChapterIds.add(item.chapter.chapterId);

  for (const chapterId of scheduledChapterIds) {
    const chapter = pool.find((c) => c.chapterId === chapterId);
    if (!chapter || chapter.revisionStatus === "done") continue;
    // Study-ready date = last study task, or the start date for chapters that were already studied.
    const ready = lastTaskDate[chapterId] ?? input.startDate;
    input.revisionIntervalsDays.forEach((intervalDays, idx) => {
      const interval = Math.max(1, intervalDays);
      pending.push({
        chapter,
        n: idx + 1,
        interval,
        due: format(addDays(parseISO(ready), interval), "yyyy-MM-dd"),
      });
    });
  }
  // Earlier due dates first; for ties, higher priority chapters first.
  pending.sort((a, b) => (a.due === b.due ? a.n - b.n : a.due < b.due ? -1 : 1));

  for (const r of pending) {
    let placed: string | null = null;
    if (r.due <= input.endDate) {
      const startIdx = Math.max(0, differenceInCalendarDays(parseISO(r.due), parseISO(input.startDate)));
      for (let i = startIdx; i < calendar.length; i++) {
        const d = calendar[i].date;
        const free = (capacityByDate.get(d) ?? 0) - (used[d] ?? 0);
        if (free >= sessionMin) {
          placed = d;
          break;
        }
      }
    }
    if (placed) {
      tasks.push({
        chapterId: r.chapter.chapterId,
        subjectSlug: r.chapter.subjectSlug,
        taskType: "revision",
        title: r.chapter.name,
        estimatedMinutes: sessionMin,
        scheduledDate: placed,
        priority: 60,
        revisionNumber: r.n,
      });
      used[placed] = (used[placed] ?? 0) + sessionMin;
    } else if (r.due <= input.endDate) {
      revisionsDropped += 1;
    }
    revisions.push({
      chapterId: r.chapter.chapterId,
      revisionNumber: r.n,
      intervalDays: r.interval,
      dueDate: placed ?? r.due,
    });
  }

  if (revisionsDropped > 0) {
    warnings.push(
      `${revisionsDropped} revision session${revisionsDropped > 1 ? "s" : ""} could not fit in your free time. A longer plan gives them room.`,
    );
  }

  const scheduledMinutes = tasks.filter((t) => t.taskType !== "test").reduce((s, t) => s + t.estimatedMinutes, 0);
  return { feasibility, warnings, tasks, revisions, trimmedChapterIds, emptyReason: null, scheduledMinutes, revisionsDropped };
}
