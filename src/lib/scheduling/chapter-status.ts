import type { ChapterStatus } from "./types";

export interface ChapterStatusInput {
  lectureDurationMinutes: number;
  lectureProgressMinutes: number;
  practiceStatus: string;
  pyqStatus: string;
  revisionStatus: string;
}

/**
 * The single source of truth for a chapter's status.
 *
 * IMPORTANT product rule: watching a lecture alone must NEVER mark a chapter
 * completed. Completed = lecture + practice/DPP + PYQs + revision all done.
 */
export function computeChapterStatus(input: ChapterStatusInput): ChapterStatus {
  const lectureComplete = input.lectureProgressMinutes >= input.lectureDurationMinutes && input.lectureDurationMinutes > 0;
  const practiceDone = input.practiceStatus === "done";
  const pyqDone = input.pyqStatus === "done";
  const revisionDone = input.revisionStatus === "done";

  if (lectureComplete && practiceDone && pyqDone && revisionDone) return "completed";
  if (lectureComplete && practiceDone && pyqDone) return "revision_pending";
  if (lectureComplete && (!practiceDone || !pyqDone)) return "pyq_pending";
  if (input.lectureProgressMinutes > 0) return "in_progress";
  return "not_started";
}

export function isChapterFullyComplete(input: ChapterStatusInput): boolean {
  return computeChapterStatus(input) === "completed";
}
