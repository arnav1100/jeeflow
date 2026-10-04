"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";
import { formatDayLabel } from "@/lib/date";
import Button from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import TaskList, { setTaskStatus } from "@/components/tasks/TaskList";
import type { TaskItem } from "@/components/tasks/types";

export interface PlanSummary {
  id: string;
  strategy: string;
  startDate: string;
  endDate: string;
  totalAvailableMinutes: number;
  totalRequiredMinutes: number;
  warnings: string[];
}

const STRATEGIES: { value: string; label: string; desc: string }[] = [
  { value: "full_syllabus", label: "Full syllabus", desc: "Cover everything, in priority order." },
  { value: "bucket_strategy", label: "Bucket strategy", desc: "Only the buckets you pick." },
  { value: "high_weightage_first", label: "High weightage first", desc: "Biggest scoring chapters first." },
  { value: "backlog_completion", label: "Backlog completion", desc: "Finish what you already started." },
  { value: "revision_focus", label: "Revision focus", desc: "Mostly revision and PYQs." },
];

function localToday(): string {
  // Browser-local date as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

export default function PlannerView({
  plan,
  initialTasks,
  today,
  defaultStrategy,
}: {
  plan: PlanSummary | null;
  initialTasks: TaskItem[];
  today: string;
  defaultStrategy: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [selected, setSelected] = useState(today);
  const [showGenerate, setShowGenerate] = useState(!plan);
  const [strategy, setStrategy] = useState(defaultStrategy === "custom_chapters" ? "full_syllabus" : defaultStrategy);
  const [buckets, setBuckets] = useState<number[]>([1, 2]);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    const set = new Set(tasks.map((t) => t.scheduledDate));
    set.add(today);
    return Array.from(set).sort();
  }, [tasks, today]);

  // Keep the selected day visible in the horizontal strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected, days.length]);

  const dayTasks = tasks.filter((t) => t.scheduledDate === selected);
  const dayMin = dayTasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  const dayDoneMin = dayTasks.filter((t) => t.status === "done").reduce((s, t) => s + t.estimatedMinutes, 0);
  const backlog = tasks.filter((t) => t.scheduledDate < today && t.status !== "done" && t.status !== "skipped");

  async function toggle(task: TaskItem) {
    const next = task.status === "done" ? "pending" : "done";
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    setError(null);
    const ok = await setTaskStatus(task.id, next);
    if (!ok) {
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      setError("Could not save that change. Check your connection and try again.");
    }
  }

  async function generate() {
    if (plan && !window.confirm("Rebuild your schedule from your current progress? Your chapter progress stays, but this week's task checkmarks reset.")) {
      return;
    }
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy,
          startDate: localToday(),
          ...(strategy === "bucket_strategy" ? { selectedBuckets: buckets } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate the plan.");
      } else {
        setMessage(`Plan ready: ${data.taskCount} tasks scheduled.`);
        setShowGenerate(false);
        setSelected(localToday());
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const totalH = plan ? Math.round(plan.totalRequiredMinutes / 60) : 0;
  const availH = plan ? Math.round(plan.totalAvailableMinutes / 60) : 0;
  const loadPercent = plan && plan.totalAvailableMinutes > 0 ? Math.round((plan.totalRequiredMinutes / plan.totalAvailableMinutes) * 100) : 0;

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-extrabold">Planner</h1>
      {plan ? (
        <p className="mt-1 text-sm text-[#64748B]">
          {formatDayLabel(plan.startDate)} → {formatDayLabel(plan.endDate)}
        </p>
      ) : (
        <p className="mt-1 text-sm text-[#64748B]">Build a day-by-day schedule from your syllabus and availability.</p>
      )}

      {plan && (
        <div className="card mt-4 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Plan workload</span>
            <span className="text-[#64748B]">
              {totalH}h needed · {availH}h available
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={Math.min(100, loadPercent)} color={loadPercent > 100 ? "#EF4444" : "#0284C7"} />
          </div>
          {plan.warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {plan.warnings.map((w, i) => (
                <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {message && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {plan && (
        <>
          <div ref={stripRef} className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-2">
            {days.map((d) => {
              const list = tasks.filter((t) => t.scheduledDate === d);
              const allDone = list.length > 0 && list.every((t) => t.status === "done");
              const hasMissed = d < today && list.some((t) => t.status !== "done" && t.status !== "skipped");
              const active = d === selected;
              const label = formatDayLabel(d).split(" ");
              return (
                <button
                  key={d}
                  data-day={d}
                  onClick={() => setSelected(d)}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-xl border px-1 py-2 text-xs transition-colors ${
                    active ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className={active ? "text-white/80" : "text-[#64748B]"}>{label[0].replace(",", "")}</span>
                  <span className="text-base font-extrabold">{label[1]}</span>
                  <span className={active ? "text-white/80" : "text-[#64748B]"}>{label[2]}</span>
                  <span
                    className={`mt-1 h-1.5 w-1.5 rounded-full ${
                      allDone ? "bg-[#22C55E]" : hasMissed ? "bg-[#F59E0B]" : list.length ? (active ? "bg-white/70" : "bg-[#38BDF8]") : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-3 mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold">
              {selected === today ? "Today" : formatDayLabel(selected, { weekday: "long" })}
            </h2>
            <span className="text-xs font-semibold text-[#64748B]">
              {formatMinutesAsHm(dayDoneMin)} / {formatMinutesAsHm(dayMin)}
            </span>
          </div>
          <TaskList tasks={dayTasks} onToggle={toggle} emptyText="No tasks on this day." />

          {backlog.length > 0 && selected === today && (
            <>
              <div className="mt-6 mb-2 flex items-center justify-between">
                <h2 className="text-base font-bold">Backlog</h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{backlog.length} pending</span>
              </div>
              <TaskList tasks={backlog} onToggle={toggle} showDate />
            </>
          )}
        </>
      )}

      <div className="mt-8">
        {plan && !showGenerate && (
          <Button variant="secondary" fullWidth onClick={() => setShowGenerate(true)}>
            Regenerate plan
          </Button>
        )}

        {showGenerate && (
          <div className="card p-4">
            <h2 className="text-base font-bold">{plan ? "Regenerate plan" : "Create your plan"}</h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Uses your availability, deadline and chapter progress from onboarding and the Syllabus tab.
            </p>

            <div className="mt-3 space-y-2">
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStrategy(s.value)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                    strategy === s.value ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"
                  }`}
                >
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="block text-xs text-[#64748B]">{s.desc}</span>
                </button>
              ))}
            </div>

            {strategy === "bucket_strategy" && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-[#64748B]">Include buckets</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((b) => {
                    const on = buckets.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBuckets((cur) => (on ? cur.filter((x) => x !== b) : [...cur, b].sort()))}
                        className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
                          on ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-slate-200 bg-white"
                        }`}
                      >
                        Bucket {b}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                fullWidth
                loading={generating}
                disabled={strategy === "bucket_strategy" && buckets.length === 0}
                onClick={generate}
              >
                {plan ? "Rebuild schedule" : "Generate plan"}
              </Button>
              {plan && (
                <Button variant="ghost" onClick={() => setShowGenerate(false)} disabled={generating}>
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
