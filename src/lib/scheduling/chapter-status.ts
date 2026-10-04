import type { ChapterStatus } from "./types";

export interface ChapterStatusInput {
  lectureDurationMinutes: number;
  lectureProgressMinutes: number;
  practiceStatus: string;
  pyqStatus: string;
  revisionStatus: string;
}

/**
 * Core study complete means:
 *
 * Lecture ✓
 * Practice / DPP ✓
 * PYQ ✓
 *
 * At this point the NEXT chapter may start.
 *
 * Revisions continue separately in the background.
 */
export function isChapterCoreComplete(
  input: ChapterStatusInput,
): boolean {
  const lectureComplete =
    input.lectureDurationMinutes > 0 &&
    input.lectureProgressMinutes >=
      input.lectureDurationMinutes;

  const practiceDone =
    input.practiceStatus === "done";

  const pyqDone =
    input.pyqStatus === "done";

  return (
    lectureComplete &&
    practiceDone &&
    pyqDone
  );
}

/**
 * Fully complete means:
 *
 * Lecture ✓
 * Practice ✓
 * PYQ ✓
 * All planned revisions ✓
 *
 * This remains the final chapter completion state.
 */
export function isChapterFullyComplete(
  input: ChapterStatusInput,
): boolean {
  return (
    isChapterCoreComplete(input) &&
    input.revisionStatus === "done"
  );
}

/**
 * Single source of truth for the stored chapter status.
 *
 * IMPORTANT:
 * "revision_pending" is already study-ready.
 * It should NOT block the next chapter.
 */
export function computeChapterStatus(
  input: ChapterStatusInput,
): ChapterStatus {
  const lectureComplete =
    input.lectureDurationMinutes > 0 &&
    input.lectureProgressMinutes >=
      input.lectureDurationMinutes;

  const practiceDone =
    input.practiceStatus === "done";

  const pyqDone =
    input.pyqStatus === "done";

  const revisionDone =
    input.revisionStatus === "done";

  if (
    lectureComplete &&
    practiceDone &&
    pyqDone &&
    revisionDone
  ) {
    return "completed";
  }

  if (
    lectureComplete &&
    practiceDone &&
    pyqDone
  ) {
    return "revision_pending";
  }

  if (
    lectureComplete &&
    (!practiceDone || !pyqDone)
  ) {
    return "pyq_pending";
  }

  if (
    input.lectureProgressMinutes > 0
  ) {
    return "in_progress";
  }

  return "not_started";
}
