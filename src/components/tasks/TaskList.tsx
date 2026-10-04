"use client";

import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";
import { subjectMeta } from "@/lib/subjects";
import { formatDayLabel } from "@/lib/date";
import { TASK_TYPE_LABEL, type TaskItem } from "./types";

/** Calls the API and returns true on success. */
export async function setTaskStatus(taskId: string, status: "pending" | "done" | "skipped"): Promise<boolean> {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function TaskList({
  tasks,
  onToggle,
  showDate = false,
  emptyText = "Nothing scheduled.",
}: {
  tasks: TaskItem[];
  onToggle: (task: TaskItem) => void;
  showDate?: boolean;
  emptyText?: string;
}) {
  if (tasks.length === 0) {
    return <p className="py-6 text-center text-sm text-[#64748B]">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const meta = subjectMeta(task.subjectSlug);
        const done = task.status === "done";
        const typeLabel =
          task.taskType === "revision" && task.revisionNumber
            ? `Revision ${task.revisionNumber}`
            : (TASK_TYPE_LABEL[task.taskType] ?? task.taskType);
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onToggle(task)}
              className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-colors ${
                done ? "border-green-200 bg-green-50/60" : "border-slate-200 hover:border-[#38BDF8]"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done ? "border-[#22C55E] bg-[#22C55E]" : "border-slate-300"
                }`}
                aria-hidden
              >
                {done && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${done ? "text-[#64748B] line-through" : ""}`}>
                  {task.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#64748B]">
                  <span className="font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span>{typeLabel}</span>
                  {showDate && <span>{formatDayLabel(task.scheduledDate)}</span>}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[#64748B]">{formatMinutesAsHm(task.estimatedMinutes)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
