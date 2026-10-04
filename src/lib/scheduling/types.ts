// Shared types for the deterministic JEEFlow planning engine.
// The engine never calls an external AI service — everything here is rule based
// so the core product works for free, forever.

export type SubjectSlug = "physics" | "chemistry" | "maths";

export type Strategy =
  | "full_syllabus"
  | "bucket_strategy"
  | "high_weightage_first"
  | "backlog_completion"
  | "revision_focus"
  | "custom_chapters";

export type ChapterStatus =
  | "not_started"
  | "in_progress"
  | "lecture_done"
  | "pyq_pending"
  | "revision_pending"
  | "completed";

export type ConfidenceLevel = "weak" | "average" | "strong";

export type TaskType = "lecture" | "practice" | "pyq" | "revision" | "test";

/** A fully resolved chapter + the signed-in user's progress on it. */
export interface EngineChapter {
  chapterId: string;
  subjectSlug: SubjectSlug;
  name: string;
  weightage: number; // 1-5
  bucket: number; // 1-3
  prerequisiteIds: string[];
  status: ChapterStatus;
  confidence: ConfidenceLevel;
  prerequisiteChoice: string | null;

  remainingLectureMinutes: number;
  practicePendingMinutes: number; // 0 if practice already done
  pyqPendingMinutes: number; // 0 if pyq already done
  revisionStatus: "pending" | "partial" | "done";

  startedAt: string | null; // ISO date, used for backlog age scoring
}

export interface EngineTestEvent {
  date: string; // yyyy-mm-dd
  durationMinutes: number;
  travelMinutes: number;
  title: string;
}

export interface GeneratePlanInput {
  userId: string;
  startDate: string; // yyyy-mm-dd (inclusive)
  endDate: string; // yyyy-mm-dd (inclusive)
  strategy: Strategy;
  selectedBuckets?: number[]; // used by bucket_strategy
  customChapterIds?: string[]; // used by custom_chapters
  availabilityMinutesByWeekday: Record<number, number>; // 0=Sun..6=Sat
  tests: EngineTestEvent[];
  chapters: EngineChapter[];
  revisionIntervalsDays: number[]; // e.g. [3,7,15]
  revisionMinutesPerSession: number;
  upcomingTestSyllabusChapterIds?: Set<string>;
}

export interface GeneratedTask {
  chapterId: string | null;
  subjectSlug: SubjectSlug | "general";
  taskType: TaskType;
  title: string;
  estimatedMinutes: number;
  scheduledDate: string;
  priority: number;
  revisionNumber?: number;
}

export interface GeneratedRevision {
  chapterId: string;
  revisionNumber: number;
  intervalDays: number;
  dueDate: string;
}

export interface FeasibilityResult {
  totalAvailableMinutes: number;
  totalRequiredMinutes: number;
  feasible: boolean;
  shortfallMinutes: number;
  /** Approximate number of days (from startDate) needed to fit the whole selection. null = availability is zero. */
  suggestedDays: number | null;
}

export interface GeneratePlanResult {
  feasibility: FeasibilityResult;
  warnings: string[];
  tasks: GeneratedTask[];
  revisions: GeneratedRevision[];
  trimmedChapterIds: string[]; // chapters excluded to keep the plan realistic
  /** Set when the selected strategy produced nothing to schedule. The caller should NOT overwrite the existing plan. */
  emptyReason: string | null;
  scheduledMinutes: number;
  /** Revision sessions that could not be placed inside the window. */
  revisionsDropped: number;
}
