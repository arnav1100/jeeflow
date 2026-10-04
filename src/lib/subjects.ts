import type { SubjectSlug } from "@/lib/scheduling/types";

export const SUBJECT_META: Record<SubjectSlug, { label: string; color: string; bg: string }> = {
  physics: { label: "Physics", color: "#2563EB", bg: "#EFF6FF" },
  chemistry: { label: "Chemistry", color: "#16A34A", bg: "#F0FDF4" },
  maths: { label: "Mathematics", color: "#EA580C", bg: "#FFF7ED" },
};

export function subjectMeta(slug: string) {
  return SUBJECT_META[slug as SubjectSlug] ?? { label: slug, color: "#64748B", bg: "#F1F5F9" };
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  weak: "Weak",
  average: "Average",
  strong: "Strong",
};

export const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  lecture_done: "Lecture Done",
  pyq_pending: "PYQ Pending",
  revision_pending: "Revision Pending",
  completed: "Completed",
};

export const STATUS_COLOR: Record<string, string> = {
  not_started: "#94A3B8",
  in_progress: "#38BDF8",
  lecture_done: "#F59E0B",
  pyq_pending: "#F59E0B",
  revision_pending: "#F59E0B",
  completed: "#22C55E",
};
