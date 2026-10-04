export interface TaskItem {
  id: string;
  chapterId: string | null;
  subjectSlug: string;
  taskType: string; // lecture | practice | pyq | revision | test
  title: string;
  estimatedMinutes: number;
  scheduledDate: string; // yyyy-mm-dd
  status: string; // pending | in_progress | done | skipped | rescheduled
  revisionNumber: number | null;
}

export const TASK_TYPE_LABEL: Record<string, string> = {
  lecture: "Lecture",
  practice: "Practice / DPP",
  pyq: "PYQ",
  revision: "Revision",
  test: "Test",
};
