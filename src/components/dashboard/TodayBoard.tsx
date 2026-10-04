"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";
import ProgressBar from "@/components/ui/ProgressBar";
import TaskList, { setTaskStatus } from "@/components/tasks/TaskList";
import type { TaskItem } from "@/components/tasks/types";

export default function TodayBoard({
  initialToday,
  initialBacklog,
  hasPlan,
}: {
  initialToday: TaskItem[];
  initialBacklog: TaskItem[];
  hasPlan: boolean;
}) {
  const [today, setToday] = useState(initialToday);
  const [backlog, setBacklog] = useState(initialBacklog);
  const [error, setError] = useState<string | null>(null);

  async function toggle(task: TaskItem, isBacklog: boolean) {
    const next = task.status === "done" ? "pending" : "done";
    const apply = (list: TaskItem[]) => list.map((t) => (t.id === task.id ? { ...t, status: next } : t));
    const set = isBacklog ? setBacklog : setToday;
    set(apply); // optimistic
    setError(null);
    const ok = await setTaskStatus(task.id, next);
    if (!ok) {
      set((list) => list.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      setError("Could not save that change. Check your connection and try again.");
    }
  }

  const totalMin = today.reduce((s, t) => s + t.estimatedMinutes, 0);
  const doneMin = today.filter((t) => t.status === "done").reduce((s, t) => s + t.estimatedMinutes, 0);
  const percent = totalMin ? Math.round((doneMin / totalMin) * 100) : 0;
  const pendingBacklog = backlog.filter((t) => t.status !== "done");

  if (!hasPlan) {
    return (
      <div className="card mt-5 p-5 text-center">
        <h2 className="text-lg font-bold">No study plan yet</h2>
        <p className="mt-1 text-sm text-[#64748B]">Generate your schedule and today&apos;s tasks will show up here.</p>
        <Link
          href="/planner"
          className="mt-4 inline-flex rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#026fa8]"
        >
          Create my plan
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="card mt-5 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Today</p>
            <p className="mt-0.5 text-2xl font-extrabold">{percent}%</p>
          </div>
          <p className="text-sm text-[#64748B]">
            {formatMinutesAsHm(doneMin)} of {formatMinutesAsHm(totalMin)} done
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar value={percent} color="#22C55E" height={10} />
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <h2 className="mt-6 mb-2 text-base font-bold">Today&apos;s tasks</h2>
      <TaskList
        tasks={today}
        onToggle={(t) => toggle(t, false)}
        emptyText="No tasks today. Rest up, or check the planner for what's next."
      />

      {backlog.length > 0 && (
        <>
          <div className="mt-6 mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold">Backlog</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {pendingBacklog.length} pending
            </span>
          </div>
          <p className="mb-2 text-xs text-[#64748B]">Missed earlier? Clear these in your Sunday backlog slot instead of eating into a fresh day.</p>
          <TaskList tasks={backlog} onToggle={(t) => toggle(t, true)} showDate />
        </>
      )}
    </>
  );
}
