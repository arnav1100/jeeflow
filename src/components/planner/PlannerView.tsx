"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";
import {
  addDaysYmd,
  formatDayLabel,
  formatMonthYear,
  startOfWeekYmd,
} from "@/lib/date";
import Button from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import TaskList, {
  setTaskStatus,
} from "@/components/tasks/TaskList";
import type { TaskItem } from "@/components/tasks/types";

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

interface Preview {
  days: number;
  feasibility: {
    totalAvailableMinutes: number;
    totalRequiredMinutes: number;
    feasible: boolean;
    suggestedDays: number | null;
  };
  emptyReason: string | null;
  trimmedCount: number;
  error?: string;
}

interface CurrentChapter {
  chapterId: string;
  subjectSlug:
    | "maths"
    | "physics"
    | "chemistry";
  name: string;
  sequenceOrder: number;
  lectureDurationMinutes: number;
  lectureProgressMinutes: number;
  remainingLectureMinutes: number;
  manualDurationSet: boolean;
}

const STRATEGIES = [
  {
    value: "full_syllabus",
    label: "Full syllabus",
    desc: "Follow the recommended chapter sequence across all three subjects.",
  },
  {
    value: "bucket_strategy",
    label: "Bucket strategy",
    desc: "Only the buckets you pick.",
  },
  {
    value: "high_weightage_first",
    label: "High weightage first",
    desc: "Biggest scoring chapters first.",
  },
  {
    value: "backlog_completion",
    label: "Backlog completion",
    desc: "Finish chapters you already started.",
  },
  {
    value: "revision_focus",
    label: "Revision focus",
    desc: "Practice, PYQs and spaced revision of finished lectures.",
  },
];

const DAY_PRESETS = [
  15,
  30,
  45,
  60,
  90,
  120,
];

const WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

const SUBJECT_LABELS = {
  maths: "Mathematics",
  physics: "Physics",
  chemistry: "Chemistry",
};

const SUBJECT_COLORS = {
  maths: "bg-violet-50 text-violet-700",
  physics: "bg-blue-50 text-blue-700",
  chemistry: "bg-emerald-50 text-emerald-700",
};

function localToday(): string {
  return new Intl.DateTimeFormat(
    "en-CA",
  ).format(new Date());
}

const hours = (min: number) =>
  Math.round(min / 60);

function minutesToHoursInput(
  minutes: number,
): string {
  const n = minutes / 60;

  if (Number.isInteger(n)) {
    return String(n);
  }

  return String(
    Math.round(n * 10) / 10,
  );
}

export default function PlannerView({
  plan,
  initialTasks,
  today,
  defaultStrategy,
  defaultDays,
}: {
  plan: PlanSummary | null;
  initialTasks: TaskItem[];
  today: string;
  defaultStrategy: string;
  defaultDays: number;
}) {
  const router = useRouter();

  const [tasks, setTasks] =
    useState(initialTasks);

  const [selected, setSelected] =
    useState(today);

  const [weekStart, setWeekStart] =
    useState(() =>
      startOfWeekYmd(today),
    );

  const [showGenerate, setShowGenerate] =
    useState(!plan);

  const [strategy, setStrategy] =
    useState(
      defaultStrategy ===
        "custom_chapters"
        ? "full_syllabus"
        : defaultStrategy,
    );

  const [buckets, setBuckets] =
    useState<number[]>([1, 2]);

  const [days, setDays] =
    useState<number>(defaultDays);

  const [customDays, setCustomDays] =
    useState<string>(
      DAY_PRESETS.includes(
        defaultDays,
      )
        ? ""
        : String(defaultDays),
    );

  const [preview, setPreview] =
    useState<Preview | null>(null);

  const [
    previewLoading,
    setPreviewLoading,
  ] = useState(false);

  const [
    generating,
    setGenerating,
  ] = useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const panelRef =
    useRef<HTMLDivElement>(null);

  // Current 1 chapter from each subject.
  const [
    currentChapters,
    setCurrentChapters,
  ] = useState<CurrentChapter[]>([]);

  const [
    chaptersLoading,
    setChaptersLoading,
  ] = useState(false);

  // chapterId -> hours typed by student
  const [
    durationHours,
    setDurationHours,
  ] = useState<
    Record<string, string>
  >({});

  const [
    savingDurations,
    setSavingDurations,
  ] = useState(false);

  const tasksByDate = useMemo(() => {
    const map = new Map<
      string,
      TaskItem[]
    >();

    for (const t of tasks) {
      const list = map.get(
        t.scheduledDate,
      );

      if (list) list.push(t);
      else
        map.set(
          t.scheduledDate,
          [t],
        );
    }

    return map;
  }, [tasks]);

  const rangeStart = plan
    ? plan.startDate < today
      ? plan.startDate
      : today
    : today;

  const rangeEnd = plan
    ? plan.endDate
    : today;

  const firstWeek =
    startOfWeekYmd(rangeStart);

  const lastWeek =
    startOfWeekYmd(rangeEnd);

  const weekDays = useMemo(
    () =>
      Array.from(
        { length: 7 },
        (_, i) =>
          addDaysYmd(
            weekStart,
            i,
          ),
      ),
    [weekStart],
  );

  async function loadCurrentChapters() {
    setChaptersLoading(true);

    try {
      const res = await fetch(
        "/api/plan/next-chapters",
        {
          cache: "no-store",
        },
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ??
            "Could not load current chapters.",
        );
      }

      const chapterList: CurrentChapter[] =
        data.chapters ?? [];

      setCurrentChapters(
        chapterList,
      );

      const values: Record<
        string,
        string
      > = {};

      for (const chapter of chapterList) {
        values[
          chapter.chapterId
        ] = minutesToHoursInput(
          chapter.lectureDurationMinutes,
        );
      }

      setDurationHours(values);
    } catch {
      setError(
        "Could not load your current chapters.",
      );
    } finally {
      setChaptersLoading(false);
    }
  }

  useEffect(() => {
    if (!showGenerate) return;

    loadCurrentChapters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGenerate]);

  function selectDay(d: string) {
    setSelected(d);
  }

  function goToWeek(ws: string) {
    const clamped =
      ws < firstWeek
        ? firstWeek
        : ws > lastWeek
          ? lastWeek
          : ws;

    setWeekStart(clamped);

    const offset = Math.max(
      0,
      weekDays.indexOf(selected),
    );

    let next = addDaysYmd(
      clamped,
      offset,
    );

    if (next < rangeStart)
      next = rangeStart;

    if (next > rangeEnd)
      next = rangeEnd;

    setSelected(next);
  }

  function goToday() {
    setWeekStart(
      startOfWeekYmd(today),
    );

    setSelected(today);
  }

  const dayTasks =
    tasksByDate.get(selected) ?? [];

  const dayMin =
    dayTasks.reduce(
      (s, t) =>
        s + t.estimatedMinutes,
      0,
    );

  const dayDoneMin =
    dayTasks
      .filter(
        (t) =>
          t.status === "done",
      )
      .reduce(
        (s, t) =>
          s +
          t.estimatedMinutes,
        0,
      );

  const backlog = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.scheduledDate <
            today &&
          t.status !== "done" &&
          t.status !== "skipped",
      ),
    [tasks, today],
  );

  async function toggle(
    task: TaskItem,
  ) {
    const next =
      task.status === "done"
        ? "pending"
        : "done";

    setTasks((list) =>
      list.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: next,
            }
          : t,
      ),
    );

    setError(null);

    const ok =
      await setTaskStatus(
        task.id,
        next,
      );

    if (!ok) {
      setTasks((list) =>
        list.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status:
                  task.status,
              }
            : t,
        ),
      );

      setError(
        "Could not save that change. Check your connection and try again.",
      );
    }
  }

  const bucketKey =
    buckets.join(",");

  useEffect(() => {
    if (!showGenerate) return;

    if (
      !days ||
      days < 1 ||
      days > 365
    ) {
      setPreview(null);
      return;
    }

    const ctrl =
      new AbortController();

    setPreviewLoading(true);

    const timer = setTimeout(
      async () => {
        try {
          const res = await fetch(
            "/api/plan/generate",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              signal:
                ctrl.signal,
              body: JSON.stringify({
                dryRun: true,
                strategy,
                days,
                startDate:
                  localToday(),
                ...(strategy ===
                "bucket_strategy"
                  ? {
                      selectedBuckets:
                        buckets,
                    }
                  : {}),
              }),
            },
          );

          const data =
            await res.json();

          setPreview(
            res.ok
              ? data
              : {
                  ...data,
                  error:
                    data.error ??
                    "Could not check this plan.",
                },
          );
        } catch {
          // aborted / offline
        } finally {
          if (
            !ctrl.signal.aborted
          ) {
            setPreviewLoading(
              false,
            );
          }
        }
      },
      450,
    );

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [
    showGenerate,
    strategy,
    days,
    bucketKey,
  ]);

  function pickDays(n: number) {
    setDays(n);

    setCustomDays(
      DAY_PRESETS.includes(n)
        ? ""
        : String(n),
    );
  }

  function openGenerate(
    withDays?: number,
  ) {
    if (withDays) {
      pickDays(withDays);
    }

    setShowGenerate(true);

    setTimeout(
      () =>
        panelRef.current?.scrollIntoView(
          {
            behavior: "smooth",
            block: "start",
          },
        ),
      50,
    );
  }

  /*
   * Saves ONLY currently shown chapters.
   * Future chapter durations are not asked.
   */
  async function saveCurrentDurations() {
  setSavingDurations(true);
  setError(null);

  if (currentChapters.length === 0) {
    setSavingDurations(false);
    return true;
  }
    
    try {
      for (const chapter of currentChapters) {
        const raw =
          durationHours[
            chapter.chapterId
          ];

        const enteredHours =
          Number(raw);

        if (
          !Number.isFinite(
            enteredHours,
          ) ||
          enteredHours <= 0
        ) {
          throw new Error(
            `Enter a valid duration for ${chapter.name}.`,
          );
        }

        const minutes =
          Math.round(
            enteredHours * 60,
          );

        /*
         * Avoid unnecessary PATCH requests
         * if default/current value was left unchanged.
         */
        if (
          minutes ===
          chapter.lectureDurationMinutes
        ) {
          continue;
        }

        /*
         * Never allow new total duration
         * to be lower than progress already completed.
         */
        if (
          minutes <
          chapter.lectureProgressMinutes
        ) {
          throw new Error(
            `${chapter.name}: total lecture duration cannot be less than the ${formatMinutesAsHm(
              chapter.lectureProgressMinutes,
            )} you have already completed.`,
          );
        }

        const res = await fetch(
          `/api/chapters/${chapter.chapterId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              manualOverrideMinutes:
                minutes,
            }),
          },
        );

        const data =
          await res.json();

        if (!res.ok) {
          throw new Error(
            data.error ??
              `Could not save ${chapter.name}.`,
          );
        }
      }

      await loadCurrentChapters();

      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save chapter durations.",
      );

      return false;
    } finally {
      setSavingDurations(false);
    }
  }

  async function generate() {
    if (
      plan &&
      !window.confirm(
        "Rebuild your schedule from your current progress? Unfinished tasks are replaced; tasks you ticked off stay in your history.",
      )
    ) {
      return;
    }

    setGenerating(true);
    setError(null);
    setMessage(null);

    try {
      /*
       * Only save the 1 current chapter per subject
       * before generating.
       */
      const durationsSaved =
        await saveCurrentDurations();

      if (!durationsSaved) {
        return;
      }

      const res = await fetch(
        "/api/plan/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            strategy,
            days,
            startDate:
              localToday(),
            ...(strategy ===
            "bucket_strategy"
              ? {
                  selectedBuckets:
                    buckets,
                }
              : {}),
          }),
        },
      );

      const data =
        await res.json();

      if (!res.ok) {
        setError(
          data.error ??
            "Could not generate the plan.",
        );

        return;
      }

      setMessage(
        `Plan ready: ${data.taskCount} tasks over ${data.days} days.`,
      );

      setShowGenerate(false);

      router.refresh();
    } catch {
      setError(
        "Network error. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  }

  const totalH = plan
    ? hours(plan.totalRequiredMinutes)
    : 0;

  const availH = plan
    ? hours(plan.totalAvailableMinutes)
    : 0;

  const loadPercent =
    plan && plan.totalAvailableMinutes > 0
      ? Math.round(
          (plan.totalRequiredMinutes /
            plan.totalAvailableMinutes) *
            100,
        )
      : 0;

  const planDays = plan
    ? Math.round(
        (Date.parse(plan.endDate) -
          Date.parse(plan.startDate)) /
          86400000,
      ) + 1
    : 0;

  const canGenerate =
    !generating &&
    !savingDurations &&
    days >= 1 &&
    days <= 365 &&
    !(
      strategy === "bucket_strategy" &&
      buckets.length === 0
    );

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-extrabold">
        Planner
      </h1>

      {plan ? (
        <p className="mt-1 text-sm text-[#64748B]">
          {formatDayLabel(
            plan.startDate,
          )}{" "}
          →{" "}
          {formatDayLabel(
            plan.endDate,
          )}{" "}
          · {planDays} days
        </p>
      ) : (
        <p className="mt-1 text-sm text-[#64748B]">
          Build a day-by-day
          schedule from your syllabus
          and availability.
        </p>
      )}

      {plan && (
        <div className="card mt-4 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              Plan workload
            </span>

            <span className="text-[#64748B]">
              {totalH}h needed ·{" "}
              {availH}h available
            </span>
          </div>

          <div className="mt-2">
            <ProgressBar
              value={Math.min(
                100,
                loadPercent,
              )}
              color={
                loadPercent > 100
                  ? "#EF4444"
                  : "#0284C7"
              }
            />
          </div>

          {plan.warnings.length >
            0 && (
            <ul className="mt-3 space-y-1.5">
              {plan.warnings.map(
                (w, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    {w}
                  </li>
                ),
              )}
            </ul>
          )}

          {loadPercent > 105 &&
            plan.suggestedDays &&
            plan.suggestedDays >
              planDays && (
              <button
                type="button"
                onClick={() =>
                  openGenerate(
                    plan.suggestedDays!,
                  )
                }
                className="mt-3 w-full rounded-lg bg-[#E0F2FE] px-3 py-2 text-sm font-semibold text-[#0284C7]"
              >
                Re-plan for{" "}
                {
                  plan.suggestedDays
                }{" "}
                days to fit
                everything
              </button>
            )}
        </div>
      )}

      {message && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {plan && (
        <>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous week"
              disabled={
                weekStart <=
                firstWeek
              }
              onClick={() =>
                goToWeek(
                  addDaysYmd(
                    weekStart,
                    -7,
                  ),
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0F172A] disabled:opacity-30"
            >
              <Chevron dir="left" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">
                {formatMonthYear(
                  addDaysYmd(
                    weekStart,
                    3,
                  ),
                )}
              </span>

              {selected !==
                today && (
                <button
                  type="button"
                  onClick={
                    goToday
                  }
                  className="rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#0284C7]"
                >
                  Today
                </button>
              )}
            </div>

            <button
              type="button"
              aria-label="Next week"
              disabled={
                weekStart >=
                lastWeek
              }
              onClick={() =>
                goToWeek(
                  addDaysYmd(
                    weekStart,
                    7,
                  ),
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0F172A] disabled:opacity-30"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {weekDays.map(
              (d, i) => {
                const list =
                  tasksByDate.get(
                    d,
                  ) ?? [];

                const inRange =
                  d >=
                    rangeStart &&
                  d <=
                    rangeEnd;

                const allDone =
                  list.length > 0 &&
                  list.every(
                    (t) =>
                      t.status ===
                      "done",
                  );

                const hasMissed =
                  d < today &&
                  list.some(
                    (t) =>
                      t.status !==
                        "done" &&
                      t.status !==
                        "skipped",
                  );

                const active =
                  d === selected;

                const isToday =
                  d === today;

                return (
                  <button
                    key={d}
                    type="button"
                    disabled={
                      !inRange
                    }
                    onClick={() =>
                      selectDay(d)
                    }
                    className={`flex flex-col items-center rounded-xl border py-2 text-xs transition-colors ${
                      active
                        ? "border-[#0284C7] bg-[#0284C7] text-white"
                        : isToday
                          ? "border-[#38BDF8] bg-white"
                          : "border-slate-200 bg-white"
                    } ${
                      !inRange
                        ? "opacity-35"
                        : ""
                    }`}
                  >
                    <span
                      className={
                        active
                          ? "text-white/80"
                          : "text-[#64748B]"
                      }
                    >
                      {
                        WEEKDAYS[
                          i
                        ]
                      }
                    </span>

                    <span className="text-base font-extrabold">
                      {Number(
                        d.slice(
                          8,
                        ),
                      )}
                    </span>

                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full ${
                        allDone
                          ? "bg-[#22C55E]"
                          : hasMissed
                            ? "bg-[#F59E0B]"
                            : list.length
                              ? active
                                ? "bg-white/70"
                                : "bg-[#38BDF8]"
                              : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              },
            )}
          </div>

          <div className="mt-4 mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold">
              {selected ===
              today
                ? "Today"
                : formatDayLabel(
                    selected,
                    {
                      weekday:
                        "long",
                    },
                  )}

              {selected ===
                today && (
                <span className="ml-2 text-sm font-medium text-[#64748B]">
                  {formatDayLabel(
                    selected,
                  )}
                </span>
              )}
            </h2>

            <span className="text-xs font-semibold text-[#64748B]">
              {formatMinutesAsHm(
                dayDoneMin,
              )}{" "}
              /{" "}
              {formatMinutesAsHm(
                dayMin,
              )}
            </span>
          </div>

          <TaskList
            tasks={dayTasks}
            onToggle={toggle}
            emptyText="Nothing planned for this day — rest or catch up on backlog."
          />

          {backlog.length >
            0 &&
            selected ===
              today && (
              <>
                <div className="mt-6 mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold">
                    Backlog
                  </h2>

                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {
                      backlog.length
                    }{" "}
                    pending
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
        </>
      )}

      <div
        className="mt-8"
        ref={panelRef}
      >
        {plan &&
          !showGenerate && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() =>
                openGenerate()
              }
            >
              Regenerate plan
            </Button>
          )}

        {showGenerate && (
          <div className="card p-4">
            <h2 className="text-base font-bold">
              {plan
                ? "Regenerate plan"
                : "Create your plan"}
            </h2>

            <p className="mt-1 text-xs text-[#64748B]">
              We only ask for the
              chapters you need right
              now. Future chapters use
              an estimate until you
              reach them.
            </p>

            {/* ================= CURRENT CHAPTERS ================= */}

            <p className="mt-5 text-sm font-semibold">
              1 · Current chapter
              durations
            </p>

            <p className="mt-1 text-xs text-[#64748B]">
              Enter the total lecture
              duration. You can keep
              the estimate if you
              don&apos;t know it.
            </p>

            {chaptersLoading ? (
              <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-[#64748B]">
                Loading your next
                chapters…
              </div>
            ) : currentChapters.length ===
              0 ? (
              <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
                No pending chapters.
                Your syllabus is
                complete.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {currentChapters.map(
                  (chapter) => (
                    <div
                      key={
                        chapter.chapterId
                      }
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              SUBJECT_COLORS[
                                chapter
                                  .subjectSlug
                              ]
                            }`}
                          >
                            {
                              SUBJECT_LABELS[
                                chapter
                                  .subjectSlug
                              ]
                            }
                          </span>

                          <p className="mt-1.5 text-sm font-bold text-[#0F172A]">
                            {
                              chapter.name
                            }
                          </p>
                        </div>

                        {chapter.manualDurationSet && (
                          <span className="text-[11px] font-medium text-green-600">
                            Custom
                          </span>
                        )}
                      </div>

                      <label className="mt-3 block text-xs font-semibold text-[#64748B]">
                        Total lecture
                        duration
                      </label>

                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.1"
                          step="0.5"
                          value={
                            durationHours[
                              chapter
                                .chapterId
                            ] ?? ""
                          }
                          onChange={(
                            e,
                          ) =>
                            setDurationHours(
                              (
                                current,
                              ) => ({
                                ...current,
                                [chapter.chapterId]:
                                  e
                                    .target
                                    .value,
                              }),
                            )
                          }
                          className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
                        />

                        <span className="text-sm text-[#64748B]">
                          hours
                        </span>
                      </div>

                      {chapter.lectureProgressMinutes >
                        0 && (
                        <p className="mt-1 text-[11px] text-[#64748B]">
                          Already
                          completed:{" "}
                          {formatMinutesAsHm(
                            chapter.lectureProgressMinutes,
                          )}
                        </p>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}

            {/* ================= STRATEGY ================= */}

            <p className="mt-5 text-sm font-semibold">
              2 · Strategy
            </p>

            <div className="mt-2 space-y-2">
              {STRATEGIES.map(
                (s) => (
                  <button
                    key={
                      s.value
                    }
                    type="button"
                    onClick={() =>
                      setStrategy(
                        s.value,
                      )
                    }
                    className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                      strategy ===
                      s.value
                        ? "border-[#38BDF8] bg-[#E0F2FE]"
                        : "border-slate-200"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {
                        s.label
                      }
                    </span>

                    <span className="block text-xs text-[#64748B]">
                      {
                        s.desc
                      }
                    </span>
                  </button>
                ),
              )}
            </div>

            {strategy ===
              "bucket_strategy" && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-[#64748B]">
                  Include buckets
                </p>

                <div className="flex gap-2">
                  {[1, 2, 3].map(
                    (b) => {
                      const on =
                        buckets.includes(
                          b,
                        );

                      return (
                        <button
                          key={
                            b
                          }
                          type="button"
                          onClick={() =>
                            setBuckets(
                              (
                                cur,
                              ) =>
                                on
                                  ? cur.filter(
                                      (
                                        x,
                                      ) =>
                                        x !==
                                        b,
                                    )
                                  : [
                                      ...cur,
                                      b,
                                    ].sort(),
                            )
                          }
                          className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
                            on
                              ? "border-[#0284C7] bg-[#0284C7] text-white"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          Bucket{" "}
                          {b}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {/* ================= DAYS ================= */}

            <p className="mt-5 text-sm font-semibold">
              3 · In how many days do
              you want to finish?
            </p>

            <div className="mt-2 grid grid-cols-3 gap-2">
              {DAY_PRESETS.map(
                (n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      pickDays(n)
                    }
                    className={`rounded-lg border py-2 text-sm font-semibold ${
                      days === n &&
                      !customDays
                        ? "border-[#0284C7] bg-[#0284C7] text-white"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {n} days
                  </button>
                ),
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={
                  customDays
                }
                placeholder="Or type your own number of days"
                onChange={(e) => {
                  const v =
                    e.target
                      .value;

                  setCustomDays(v);

                  const n =
                    Number(v);

                  setDays(
                    Number.isFinite(
                      n,
                    ) && n > 0
                      ? Math.min(
                          365,
                          Math.floor(
                            n,
                          ),
                        )
                      : 0,
                  );
                }}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
              />
            </div>

            {/* ================= PREVIEW ================= */}

            <div className="mt-4 min-h-[64px] rounded-xl bg-slate-50 p-3 text-sm">
              {previewLoading &&
                !preview && (
                  <p className="text-[#64748B]">
                    Checking your
                    plan…
                  </p>
                )}

              {preview && (
                <div
                  className={
                    previewLoading
                      ? "opacity-60"
                      : ""
                  }
                >
                  {preview.emptyReason ? (
                    <p className="font-medium text-red-600">
                      {
                        preview.emptyReason
                      }
                    </p>
                  ) : preview.error ? (
                    <p className="font-medium text-red-600">
                      {
                        preview.error
                      }
                    </p>
                  ) : (
                    <>
                      <p className="font-semibold">
                        {hours(
                          preview
                            .feasibility
                            .totalRequiredMinutes,
                        )}
                        h needed ·{" "}
                        {hours(
                          preview
                            .feasibility
                            .totalAvailableMinutes,
                        )}
                        h free in{" "}
                        {
                          preview.days
                        }{" "}
                        days
                      </p>

                      {preview
                        .feasibility
                        .feasible ? (
                        <p className="mt-1 text-xs text-green-700">
                          This fits your
                          free time.
                        </p>
                      ) : (
                        <>
                          <p className="mt-1 text-xs text-amber-800">
                            Not
                            everything
                            fits.{" "}
                            {
                              preview.trimmedCount
                            }{" "}
                            lower-priority
                            chapters may
                            be left out
                            {preview
                              .feasibility
                              .suggestedDays
                              ? ` — about ${preview.feasibility.suggestedDays} days fits it all.`
                              : "."}
                          </p>

                          {preview
                            .feasibility
                            .suggestedDays &&
                            preview
                              .feasibility
                              .suggestedDays >
                              preview.days && (
                              <button
                                type="button"
                                onClick={() =>
                                  pickDays(
                                    Math.min(
                                      365,
                                      preview
                                        .feasibility
                                        .suggestedDays!,
                                    ),
                                  )
                                }
                                className="mt-2 rounded-lg bg-[#E0F2FE] px-3 py-1.5 text-xs font-semibold text-[#0284C7]"
                              >
                                Use{" "}
                                {Math.min(
                                  365,
                                  preview
                                    .feasibility
                                    .suggestedDays!,
                                )}{" "}
                                days
                              </button>
                            )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                fullWidth
                loading={
                  generating ||
                  savingDurations
                }
                disabled={
                  !canGenerate
                }
                onClick={
                  generate
                }
              >
                {plan
                  ? "Save & rebuild schedule"
                  : "Save & generate plan"}
              </Button>

              {plan && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setShowGenerate(
                      false,
                    )
                  }
                  disabled={
                    generating ||
                    savingDurations
                  }
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chevron({
  dir,
}: {
  dir: "left" | "right";
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={
          dir === "left"
            ? "M15 5l-7 7 7 7"
            : "M9 5l7 7-7 7"
        }
      />
    </svg>
  );
}
