"use client";

import { useMemo, useState } from "react";
import { formatMinutesAsHm } from "@/lib/scheduling/lecture-time";
import { STATUS_COLOR, STATUS_LABEL, subjectMeta } from "@/lib/subjects";
import { formatDayLabel } from "@/lib/date";
import ProgressBar from "@/components/ui/ProgressBar";
import type { ChapterProgressRow, DayStat } from "@/lib/data/progress";
import type { ProgressSummary } from "@/lib/data/tasks";

const SUBJECTS = ["physics", "chemistry", "maths"] as const;
const BUCKET_LABEL: Record<number, string> = {
  1: "Bucket 1 · Foundation",
  2: "Bucket 2 · High weightage",
  3: "Bucket 3 · Moderate",
};
const STATUS_ORDER = ["not_started", "in_progress", "lecture_done", "pyq_pending", "revision_pending", "completed"];

export default function ProgressView({
  summary,
  chapters,
  week,
  today,
}: {
  summary: ProgressSummary;
  chapters: ChapterProgressRow[];
  week: DayStat[];
  today: string;
}) {
  const [tab, setTab] = useState<(typeof SUBJECTS)[number]>("physics");
  const [bucketFilter, setBucketFilter] = useState<number | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const ch of chapters) c[ch.status] = (c[ch.status] ?? 0) + 1;
    return c;
  }, [chapters]);

  const visible = useMemo(
    () =>
      chapters
        .filter((c) => c.subjectSlug === tab)
        .filter((c) => bucketFilter === "all" || c.bucket === bucketFilter)
        .sort((a, b) => a.bucket - b.bucket || b.weightage - a.weightage || a.name.localeCompare(b.name)),
    [chapters, tab, bucketFilter],
  );

  const weekPlanned = week.reduce((s, d) => s + d.plannedMinutes, 0);
  const weekDone = week.reduce((s, d) => s + d.doneMinutes, 0);
  const adherence = weekPlanned > 0 ? Math.round((weekDone / weekPlanned) * 100) : null;
  const maxDay = Math.max(60, ...week.map((d) => Math.max(d.plannedMinutes, d.doneMinutes)));

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-extrabold">Progress</h1>
      <p className="mt-1 text-sm text-[#64748B]">A chapter counts as complete only after lecture, practice, PYQs and revision.</p>

      <div className="card mt-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Overall</p>
            <p className="mt-0.5 text-3xl font-extrabold">{summary.overallPercent}%</p>
          </div>
          <p className="text-right text-xs text-[#64748B]">
            {counts.completed ?? 0} of {chapters.length} chapters
            <br />
            fully completed
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar value={summary.overallPercent} height={10} />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-[#334155]"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]} · {counts[s]}
            </span>
          ))}
        </div>
      </div>

      <h2 className="mt-6 text-base font-bold">Last 7 days</h2>
      <div className="card mt-2 p-4">
        <div className="flex items-end justify-between text-sm">
          <span className="text-[#64748B]">
            <span className="text-lg font-extrabold text-[#0F172A]">{formatMinutesAsHm(weekDone)}</span> studied
            {weekPlanned > 0 && <> of {formatMinutesAsHm(weekPlanned)} planned</>}
          </span>
          {adherence !== null && (
            <span className="font-semibold" style={{ color: adherence >= 70 ? "#16A34A" : adherence >= 40 ? "#D97706" : "#DC2626" }}>
              {adherence}%
            </span>
          )}
        </div>
        <div className="mt-4 flex h-28 items-end justify-between gap-2">
          {week.map((d) => {
            const plannedH = (d.plannedMinutes / maxDay) * 100;
            const doneH = (d.doneMinutes / maxDay) * 100;
            const isToday = d.date === today;
            return (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div className="absolute bottom-0 w-full max-w-[28px] rounded-t-md bg-slate-200" style={{ height: `${plannedH}%` }} />
                  <div className="absolute bottom-0 w-full max-w-[28px] rounded-t-md bg-[#22C55E]" style={{ height: `${doneH}%` }} />
                </div>
                <span className={`text-[10px] ${isToday ? "font-bold text-[#0284C7]" : "text-[#64748B]"}`}>
                  {formatDayLabel(d.date).split(",")[0]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-[#64748B]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-200" />Planned</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#22C55E]" />Done</span>
        </div>
      </div>

      <h2 className="mt-6 text-base font-bold">By bucket</h2>
      <div className="card mt-2 space-y-4 p-4">
        {summary.byBucket.map((b) => (
          <div key={b.bucket}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-semibold">{BUCKET_LABEL[b.bucket]}</span>
              <span className="text-xs text-[#64748B]">
                {b.completed}/{b.total} done · {b.percent}%
              </span>
            </div>
            <ProgressBar value={b.percent} />
          </div>
        ))}
      </div>

      <h2 className="mt-6 text-base font-bold">Chapters</h2>
      <div className="mt-2 flex gap-2">
        {SUBJECTS.map((s) => {
          const meta = subjectMeta(s);
          const sub = summary.bySubject.find((x) => x.slug === s);
          const active = tab === s;
          return (
            <button
              key={s}
              onClick={() => setTab(s)}
              className="flex-1 rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors"
              style={active ? { backgroundColor: meta.color, borderColor: meta.color, color: "#fff" } : { borderColor: "#E2E8F0", backgroundColor: "#fff" }}
            >
              {meta.label.slice(0, 5) === "Mathe" ? "Maths" : meta.label}
              <span className={`block text-[11px] font-medium ${active ? "text-white/80" : "text-[#64748B]"}`}>{sub?.percent ?? 0}%</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {(["all", 1, 2, 3] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBucketFilter(b)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
              bucketFilter === b ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-slate-200 bg-white text-[#475569]"
            }`}
          >
            {b === "all" ? "All buckets" : `Bucket ${b}`}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {visible.map((c) => (
          <li key={c.chapterId} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="mt-0.5 text-xs text-[#64748B]">Bucket {c.bucket}</p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: `${STATUS_COLOR[c.status]}22`, color: c.status === "not_started" ? "#64748B" : "#0F172A" }}
              >
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <ProgressBar value={c.percent} color={subjectMeta(c.subjectSlug).color} height={6} />
              </div>
              <span className="w-9 text-right text-xs font-semibold text-[#64748B]">{c.percent}%</span>
            </div>
          </li>
        ))}
        {visible.length === 0 && <li className="py-6 text-center text-sm text-[#64748B]">No chapters in this bucket.</li>}
      </ul>
    </div>
  );
}
