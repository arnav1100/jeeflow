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

export type TaskType =
  | "lecture"
  | "practice"
  | "pyq"
  | "revision"
  | "test";

export interface EngineChapter {
  chapterId: string;
  subjectSlug: SubjectSlug;
  name: string;

  // Subject-wise fixed JEE order.
  sequenceOrder: number;

  weightage: number;
  bucket: number;
  prerequisiteIds: string[];

  status: ChapterStatus;
  confidence: ConfidenceLevel;
  prerequisiteChoice: string | null;

  lectureDurationMinutes: number;
  lectureProgressMinutes: number;
  manualDurationSet: boolean;

  remainingLectureMinutes: number;
  practicePendingMinutes: number;
  pyqPendingMinutes: number;

  revisionStatus: "pending" | "partial" | "done";

  startedAt: string | null;
}

export interface EngineExistingRevision {
  chapterId: string;
  revisionNumber: number;
  intervalDays: number;
  dueDate: string;
  status: "pending" | "scheduled" | "done" | "skipped";
}

export interface EngineTestEvent {
  date: string;
  durationMinutes: number;
  travelMinutes: number;
  title: string;
}

export interface GeneratePlanInput {
  userId: string;
  startDate: string;
  endDate: string;

  /**
 * Last date for which exact daily tasks should be generated.
 * endDate remains the student's long-term target window.
 */
scheduleEndDate?: string;
  
  strategy: Strategy;

  selectedBuckets?: number[];
  customChapterIds?: string[];

  availabilityMinutesByWeekday: Record<number, number>;
  tests: EngineTestEvent[];
  chapters: EngineChapter[];

  revisionIntervalsDays: number[];
  revisionMinutesPerSession: number;

  existingRevisions?: EngineExistingRevision[];

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

  status:
    | "pending"
    | "scheduled"
    | "done"
    | "skipped";
}

export interface FeasibilityResult {
  totalAvailableMinutes: number;
  totalRequiredMinutes: number;
  feasible: boolean;
  shortfallMinutes: number;
  suggestedDays: number | null;
}

export interface GeneratePlanResult {
  feasibility: FeasibilityResult;
  warnings: string[];
  tasks: GeneratedTask[];
  revisions: GeneratedRevision[];
  trimmedChapterIds: string[];
  emptyReason: string | null;
  scheduledMinutes: number;
  revisionsDropped: number;
}
