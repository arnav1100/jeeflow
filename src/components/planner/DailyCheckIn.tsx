"use client";

import { useState } from "react";

import type { TaskItem } from "@/components/tasks/types";
import { setTaskStatus } from "@/components/tasks/TaskList";
import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";

type Decision = "done" | "missed";

export default function DailyCheckIn({
  tasks,
  onComplete,
}: {
  tasks: TaskItem[];
  onComplete: () => void;
}) {
  const [decisions, setDecisions] =
    useState<Record<string, Decision>>({});

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const allAnswered = tasks.every(
    (task) => decisions[task.id],
  );

  function choose(
    taskId: string,
    decision: Decision,
  ) {
    setDecisions((current) => ({
      ...current,
      [taskId]: decision,
    }));
  }

  async function submit() {
    if (!allAnswered) {
      setError(
        "Please review each unfinished task.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const results =
        await Promise.all(
          tasks.map(async (task) => {
            const status =
              decisions[task.id] === "done"
                ? "done"
                : "skipped";

            return setTaskStatus(
              task.id,
              status,
            );
          }),
        );

      if (
        results.some((ok) => !ok)
      ) {
        throw new Error(
          "Some task updates could not be saved.",
        );
      }

      onComplete();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save check-in.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-lg font-extrabold">
        Quick check-in
      </h2>

      <p className="mt-1 text-sm text-[#64748B]">
        These older tasks were not marked
        complete. Tell us what actually happened
        before we plan today.
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {tasks.map((task) => {
          const decision =
            decisions[task.id];

          return (
            <div
              key={task.id}
              className="rounded-xl border border-slate-200 p-3"
            >
              <p className="text-xs font-semibold uppercase text-[#64748B]">
                {task.subjectSlug}
              </p>

              <p className="mt-1 text-sm font-bold">
                {task.title}
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                {task.taskType} ·{" "}
                {formatMinutesAsHm(
                  task.estimatedMinutes,
                )}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    choose(
                      task.id,
                      "done",
                    )
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                    decision === "done"
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-green-200 bg-green-50 text-green-700"
                  }`}
                >
                  ✓ I did this
                </button>

                <button
                  type="button"
                  onClick={() =>
                    choose(
                      task.id,
                      "missed",
                    )
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                    decision === "missed"
                      ? "border-slate-700 bg-slate-700 text-white"
                      : "border-slate-200 bg-white text-[#64748B]"
                  }`}
                >
                  Didn&apos;t do
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={
          saving || !allAnswered
        }
        onClick={submit}
        className="mt-4 w-full rounded-xl bg-[#0284C7] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {saving
          ? "Updating…"
          : "Update & plan today"}
      </button>
    </div>
  );
}
