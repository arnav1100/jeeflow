"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

import PlanSetup from "@/components/planner/PlanSetup";
import Button from "@/components/ui/Button";
import TaskList, {
  setTaskStatus,
} from "@/components/tasks/TaskList";
import type { TaskItem } from "@/components/tasks/types";

import {
  addDaysYmd,
  formatDayLabel,
} from "@/lib/date";
import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";

export interface PlanSummary {
  id: string;
  strategy: string;
  startDate: string;
  endDate: string;
  totalAvailableMinutes: number;
  totalRequiredMinutes: number;
  warnings: string[];
  suggestedDays: number | null;
}

const DAY_PRESETS = [
  30,
  60,
  90,
  120,
];

function localToday() {
  return new Intl.DateTimeFormat(
    "en-CA",
  ).format(new Date());
}

function daysLeft(
  today: string,
  endDate: string,
) {
  const diff =
    Math.floor(
      (Date.parse(endDate) -
        Date.parse(today)) /
        86400000,
    ) + 1;

  return Math.max(
    0,
    diff,
  );
}

export default function PlannerView({
  plan,
  initialTasks,
  today,
  defaultDays,
}: {
  plan: PlanSummary | null;
  initialTasks: TaskItem[];
  today: string;
  defaultStrategy: string;
  defaultDays: number;
}) {
  const router =
    useRouter();

  const [tasks, setTasks] =
    useState(initialTasks);

  const [
    setupChecked,
    setSetupChecked,
  ] = useState(false);

  const [
    setupDone,
    setSetupDone,
  ] = useState(false);

  const [
    editingPreparation,
    setEditingPreparation,
  ] = useState(false);

  const [
    showGenerate,
    setShowGenerate,
  ] = useState(!plan);

  const [days, setDays] =
    useState(defaultDays);

  const [
    customDays,
    setCustomDays,
  ] = useState(
    DAY_PRESETS.includes(
      defaultDays,
    )
      ? ""
      : String(defaultDays),
  );

  const [
    generating,
    setGenerating,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [
    todayCapacity,
    setTodayCapacity,
  ] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(
        "/api/plan/setup-progress",
        {
          cache: "no-store",
        },
      ).then((r) =>
        r.json(),
      ),

      fetch(
        "/api/plan/today-capacity",
        {
          cache: "no-store",
        },
      ).then((r) =>
        r.json(),
      ),
    ])
      .then(
        ([
          setup,
          capacity,
        ]) => {
          if (cancelled) {
            return;
          }

          setSetupDone(
            setup.setupCompleted ===
              true,
          );

          if (
            typeof capacity.schedulableMinutes ===
            "number"
          ) {
            setTodayCapacity(
              capacity.schedulableMinutes,
            );
          }
        },
      )
      .catch(() => {
        if (!cancelled) {
          setError(
            "Could not load planner information.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSetupChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const todayTasks =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.scheduledDate ===
            today,
        ),
      [tasks, today],
    );

    const nextTaskDate = useMemo(() => {
    const futureDates = tasks
      .filter(
        (task) =>
          task.scheduledDate > today &&
          task.status !== "skipped",
      )
      .map(
        (task) => task.scheduledDate,
      )
      .sort();

    return futureDates[0] ?? null;
  }, [tasks, today]);

  const nextDayTasks = useMemo(() => {
    if (!nextTaskDate) {
      return [];
    }

    return tasks.filter(
      (task) =>
        task.scheduledDate === nextTaskDate,
    );
  }, [tasks, nextTaskDate]);

  const backlog =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.scheduledDate <
              today &&
            task.status !==
              "done" &&
            task.status !==
              "skipped",
        ),
      [tasks, today],
    );

  const totalMinutes =
    todayTasks.reduce(
      (sum, task) =>
        sum +
        task.estimatedMinutes,
      0,
    );

  const completedMinutes =
    todayTasks
      .filter(
        (task) =>
          task.status ===
          "done",
      )
      .reduce(
        (sum, task) =>
          sum +
          task.estimatedMinutes,
        0,
      );

  async function toggle(
    task: TaskItem,
  ) {
    const previous =
      task.status;

    const next =
      previous === "done"
        ? "pending"
        : "done";

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: next,
            }
          : item,
      ),
    );

    const ok =
      await setTaskStatus(
        task.id,
        next,
      );

    if (!ok) {
      setTasks((current) =>
        current.map(
          (item) =>
            item.id ===
            task.id
              ? {
                  ...item,
                  status:
                    previous,
                }
              : item,
        ),
      );

      setError(
        "Could not save task progress.",
      );
    }
  }

  function chooseDays(
    value: number,
  ) {
    setDays(value);

    setCustomDays(
      DAY_PRESETS.includes(
        value,
      )
        ? ""
        : String(value),
    );
  }

  async function generate() {
    if (
      days < 1 ||
      days > 365
    ) {
      setError(
        "Choose between 1 and 365 days.",
      );
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/plan/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            strategy:
              "full_syllabus",
            days,
            startDate:
              localToday(),
          }),
        },
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ??
            "Could not create today's plan.",
        );
      }

      setShowGenerate(
        false,
      );

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create plan.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (!setupChecked) {
    return (
      <div className="pb-6">
        <h1 className="text-2xl font-extrabold">
          Planner
        </h1>

        <p className="mt-3 text-sm text-[#64748B]">
          Loading planner…
        </p>
      </div>
    );
  }

  if (
    !setupDone ||
    editingPreparation
  ) {
    return (
      <div className="pb-6">
        <h1 className="text-2xl font-extrabold">
          Planner
        </h1>

        <div className="mt-4">
          <PlanSetup
            editMode={
              setupDone
            }
            onCancel={() =>
              setEditingPreparation(
                false,
              )
            }
            onComplete={() => {
              setSetupDone(
                true,
              );

              setEditingPreparation(
                false,
              );

              setShowGenerate(
                true,
              );

              router.refresh();
            }}
          />
        </div>
      </div>
    );
  }

  const remainingDays =
    plan
      ? daysLeft(
          today,
          plan.endDate,
        )
      : null;

  return (
    <div className="pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">
            Planner
          </h1>

          {plan && (
            <p className="mt-1 text-sm text-[#64748B]">
              {remainingDays} days
              left · target{" "}
              {formatDayLabel(
                plan.endDate,
              )}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            setEditingPreparation(
              true,
            )
          }
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
        >
          Edit preparation
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {showGenerate && (
        <div className="card mt-5 p-4">
          <h2 className="font-bold">
            Set your target
          </h2>

          <p className="mt-1 text-sm text-[#64748B]">
            In how many days do you
            want to cover your
            remaining syllabus?
          </p>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {DAY_PRESETS.map(
              (value) => (
                <button
                  key={
                    value
                  }
                  type="button"
                  onClick={() =>
                    chooseDays(
                      value,
                    )
                  }
                  className={`rounded-lg border py-2 text-sm font-bold ${
                    days ===
                      value &&
                    !customDays
                      ? "border-[#0284C7] bg-[#0284C7] text-white"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  {value}
                </button>
              ),
            )}
          </div>

          <input
            type="number"
            min={1}
            max={365}
            value={customDays}
            placeholder="Custom days"
            onChange={(e) => {
              const value =
                e.target.value;

              setCustomDays(
                value,
              );

              const parsed =
                Number(value);

              setDays(
                Number.isFinite(
                  parsed,
                )
                  ? Math.max(
                      0,
                      Math.min(
                        365,
                        Math.floor(
                          parsed,
                        ),
                      ),
                    )
                  : 0,
              );
            }}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />

          {todayCapacity !==
            null && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              Today you have about{" "}
              <strong>
                {formatMinutesAsHm(
                  todayCapacity,
                )}
              </strong>{" "}
              usable study time left.
            </p>
          )}

          <Button
            fullWidth
            loading={
              generating
            }
            disabled={
              generating ||
              days < 1
            }
            onClick={
              generate
            }
          >
            Create my plan
          </Button>
        </div>
      )}

      {plan &&
        !showGenerate && (
          <>
            <div className="mt-5 rounded-2xl bg-[#0F172A] p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/60">
                    TODAY
                  </p>

                  <p className="mt-1 text-lg font-extrabold">
                    {formatDayLabel(
                      today,
                      {
                        weekday:
                          "long",
                      },
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-white/60">
                    Planned
                  </p>

                  <p className="font-bold">
                    {formatMinutesAsHm(
                      totalMinutes,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3 text-sm text-white/80">
                {formatMinutesAsHm(
                  completedMinutes,
                )}{" "}
                completed
                {todayCapacity !==
                  null &&
                  ` · ${formatMinutesAsHm(
                    todayCapacity,
                  )} usable today`}
              </div>
            </div>

            <div className="mt-4">
              {todayTasks.length > 0 ? (
  <TaskList
    tasks={todayTasks}
    onToggle={toggle}
    emptyText="No tasks planned for today."
  />
) : nextTaskDate ? (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <p className="text-sm font-bold">
      Today&apos;s study window is over
    </p>

    <p className="mt-1 text-sm text-[#64748B]">
      Your next plan starts{" "}
      {formatDayLabel(nextTaskDate, {
        weekday: "long",
      })}
      .
    </p>

    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#64748B]">
        Next up
      </p>

      <TaskList
        tasks={nextDayTasks}
        onToggle={toggle}
        emptyText="No upcoming tasks."
      />
    </div>
  </div>
) : (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-[#64748B]">
    Nothing is planned for today.
  </div>
)}
            </div>

            {backlog.length >
              0 && (
              <>
                <div className="mt-6 mb-2 flex items-center justify-between">
                  <h2 className="font-bold">
                    Carry-over
                  </h2>

                  <span className="text-xs text-[#64748B]">
                    {
                      backlog.length
                    }{" "}
                    unfinished
                  </span>
                </div>

                <TaskList
                  tasks={
                    backlog
                  }
                  onToggle={
                    toggle
                  }
                  showDate
                />
              </>
            )}

            <button
              type="button"
              onClick={() =>
                setShowGenerate(
                  true,
                )
              }
              className="mt-6 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
            >
              Change target / rebuild
            </button>
          </>
        )}
    </div>
  );
}
