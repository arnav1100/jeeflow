import type { EngineChapter, Strategy } from "./types";

export interface PriorityContext {
  strategy: Strategy;
  daysRemaining: number;
  upcomingTestSyllabusChapterIds: Set<string>;
  completedPrerequisiteIds: Set<string>;
  today: string;
}

/**
 * Deterministic priority score for ordering chapters inside a subject queue.
 * Higher score = should be worked on sooner.
 *
 * Factors (see spec section 15):
 * 1. Prerequisites readiness
 * 2. Bucket
 * 3. Weightage
 * 4. Deadline pressure
 * 5. Already in-progress chapters
 * 6. PYQ pending after lecture
 * 7. (Revision handled separately in the engine)
 * 8. Upcoming test syllabus
 * 9. Student weakness (confidence)
 * 10. Backlog age
 */
export function computeChapterPriority(chapter: EngineChapter, ctx: PriorityContext): number {
  let score = 0;

  // 2. Bucket weighting — foundation (1) and high-weightage (2) chapters are
  // generally tackled before moderate/low-priority (3) ones.
  const bucketScore = { 1: 18, 2: 22, 3: 8 }[chapter.bucket as 1 | 2 | 3] ?? 10;
  score += bucketScore;

  // 3. Raw syllabus weightage (1-5)
  score += chapter.weightage * 6;

  if (ctx.strategy === "high_weightage_first") {
    score += chapter.weightage * 8; // double down on weightage for this strategy
  }

  // 1. Prerequisite readiness — penalize chapters whose prerequisites are not
  // complete and the student hasn't acknowledged a choice yet.
  const unmetPrereqs = chapter.prerequisiteIds.filter((id) => !ctx.completedPrerequisiteIds.has(id));
  if (unmetPrereqs.length > 0 && !chapter.prerequisiteChoice) {
    score -= unmetPrereqs.length * 10;
  } else if (unmetPrereqs.length > 0 && chapter.prerequisiteChoice === "already_know") {
    score += 4; // student is confident, no penalty, slight bonus for momentum
  }

  // 4. Deadline pressure — the fewer days remaining, the more every pending
  // chapter should be pulled forward (keeps plan compact near the deadline).
  const urgency = Math.max(0, 60 - ctx.daysRemaining) / 4;
  score += urgency;

  // 5. Momentum — strongly prefer finishing something already started over
  // opening a new chapter (keeps ~1 active chapter per subject).
  if (chapter.status === "in_progress" || chapter.status === "lecture_done") {
    score += 40;
  }
  if (chapter.status === "pyq_pending") {
    score += 35;
  }

  // 6. PYQ pending right after lecture completion should be closed out fast.
  if (chapter.remainingLectureMinutes === 0 && chapter.pyqPendingMinutes > 0) {
    score += 20;
  }

  // 8. Upcoming test syllabus bonus.
  if (ctx.upcomingTestSyllabusChapterIds.has(chapter.chapterId)) {
    score += 25;
  }

  // 9. Student weakness — weak confidence chapters get more attention.
  if (chapter.confidence === "weak") score += 15;
  if (chapter.confidence === "strong") score -= 5;

  // 10. Backlog age — chapters started long ago and still unfinished age up.
  if (chapter.startedAt) {
    const ageDays = Math.max(
      0,
      Math.floor((new Date(ctx.today).getTime() - new Date(chapter.startedAt).getTime()) / 86_400_000),
    );
    score += Math.min(30, ageDays * 1.5);
  }

  return Math.round(score);
}

/** Filters the chapter pool according to the chosen study strategy. */
export function filterChaptersByStrategy(
  chapters: EngineChapter[],
  strategy: Strategy,
  selectedBuckets?: number[],
  customChapterIds?: string[],
): EngineChapter[] {
  const notCompleted = chapters.filter((c) => c.status !== "completed");

  switch (strategy) {
    case "bucket_strategy":
      if (selectedBuckets && selectedBuckets.length > 0) {
        return notCompleted.filter((c) => selectedBuckets.includes(c.bucket));
      }
      return notCompleted;
    case "backlog_completion":
      return notCompleted.filter((c) =>
        ["in_progress", "lecture_done", "pyq_pending", "revision_pending"].includes(c.status),
      );
    case "custom_chapters":
      if (customChapterIds && customChapterIds.length > 0) {
        return notCompleted.filter((c) => customChapterIds.includes(c.chapterId));
      }
      return notCompleted;
    case "revision_focus":
      // Keep only chapters that still need fresh study time minimally; revision
      // tasks themselves are generated separately from revision_schedule.
      return notCompleted.filter((c) => c.status === "in_progress" || c.status === "pyq_pending");
    case "high_weightage_first":
      return notCompleted;
    case "full_syllabus":
    default:
      return notCompleted;
  }
}
