"use client";

import { useMemo, useState } from "react";
import type { ChapterView } from "@/lib/data/chapters";
import { calculatePlannedLectureMinutes, formatMinutesAsHm } from "@/lib/scheduling/lecture-time";
import { STATUS_COLOR, STATUS_LABEL, subjectMeta } from "@/lib/subjects";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button";

const TABS: { slug: "physics" | "chemistry" | "maths"; label: string }[] = [
  { slug: "physics", label: "Physics" },
  { slug: "chemistry", label: "Chemistry" },
  { slug: "maths", label: "Mathematics" },
];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "pyq_pending", label: "PYQ Pending" },
  { value: "revision_pending", label: "Revision Pending" },
  { value: "completed", label: "Completed" },
];

export default function SyllabusBoard({ initialChapters }: { initialChapters: ChapterView[] }) {
  const [chapters, setChapters] = useState(initialChapters);
  const [tab, setTab] = useState<"physics" | "chemistry" | "maths">("physics");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return chapters
      .filter((c) => c.subjectSlug === tab)
      .filter((c) => filter === "all" || c.userChapter?.status === filter);
  }, [chapters, tab, filter]);

  function patchLocal(chapterId: string, patch: Partial<NonNullable<ChapterView["userChapter"]>>) {
    setChapters((prev) =>
      prev.map((c) => (c.chapterId === chapterId && c.userChapter ? { ...c, userChapter: { ...c.userChapter, ...patch } } : c)),
    );
  }

  async function saveChapter(chapterId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/chapters/${chapterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      patchLocal(chapterId, data.userChapter ? mapServerToLocal(data.userChapter, data.status) : {});
    }
    return data;
  }

  function mapServerToLocal(uc: Record<string, unknown>, status: string) {
    return {
      lectureOriginalMinutes: uc.lectureOriginalMinutes,
      lectureDurationMinutes: uc.lectureDurationMinutes,
      lectureProgressMinutes: uc.lectureProgressMinutes,
      durationType: uc.durationType,
      playbackSpeed: uc.playbackSpeed,
      noteOverheadPercent: uc.noteOverheadPercent,
      manualOverrideMinutes: uc.manualOverrideMinutes,
      practiceMinutes: uc.practiceMinutes,
      practiceStatus: uc.practiceStatus,
      pyqMinutes: uc.pyqMinutes,
      pyqStatus: uc.pyqStatus,
      revisionStatus: uc.revisionStatus,
      confidence: uc.confidence,
      bucket: uc.bucket,
      prerequisiteChoice: uc.prerequisiteChoice,
      status,
    } as Partial<NonNullable<ChapterView["userChapter"]>>;
  }

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-extrabold">Syllabus</h1>
      <p className="mt-1 text-sm text-[#64748B]">Set lecture duration, track PYQs and revision per chapter.</p>

      <div className="mt-4 flex gap-2 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const meta = subjectMeta(t.slug);
          const active = tab === t.slug;
          return (
            <button
              key={t.slug}
              onClick={() => setTab(t.slug)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${active ? "bg-white shadow" : ""}`}
              style={{ color: active ? meta.color : "#64748B" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === f.value ? "bg-[#0284C7] text-white" : "bg-slate-100 text-[#64748B]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {visible.length === 0 && (
          <div className="card p-6 text-center text-sm text-[#64748B]">No chapters match this filter.</div>
        )}
        {visible.map((chapter) => (
          <ChapterCard
            key={chapter.chapterId}
            chapter={chapter}
            expanded={expandedId === chapter.chapterId}
            onToggleExpand={() => setExpandedId(expandedId === chapter.chapterId ? null : chapter.chapterId)}
            onSave={(body) => saveChapter(chapter.chapterId, body)}
            onLocalPatch={(patch) => patchLocal(chapter.chapterId, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function ChapterCard({
  chapter,
  expanded,
  onToggleExpand,
  onSave,
  onLocalPatch,
}: {
  chapter: ChapterView;
  expanded: boolean;
  onToggleExpand: () => void;
  onSave: (body: Record<string, unknown>) => Promise<unknown>;
  onLocalPatch: (patch: Partial<NonNullable<ChapterView["userChapter"]>>) => void;
}) {
  const uc = chapter.userChapter;
  const meta = subjectMeta(chapter.subjectSlug);
  if (!uc) return null;

  const [hours, setHours] = useState(Math.floor(uc.lectureOriginalMinutes / 60));
  const [mins, setMins] = useState(uc.lectureOriginalMinutes % 60);
  const [durationType, setDurationType] = useState<"original" | "actual_watch">(
    uc.durationType === "actual_watch" ? "actual_watch" : "original",
  );
  const [speed, setSpeed] = useState(uc.playbackSpeed);
  const [overhead, setOverhead] = useState(uc.noteOverheadPercent);
  const [manualOverride, setManualOverride] = useState<string>(uc.manualOverrideMinutes ? String(uc.manualOverrideMinutes) : "");
  const [progressH, setProgressH] = useState(Math.floor(uc.lectureProgressMinutes / 60));
  const [progressM, setProgressM] = useState(uc.lectureProgressMinutes % 60);
  const [saving, setSaving] = useState(false);

  const previewMinutes = manualOverride
    ? Number(manualOverride)
    : calculatePlannedLectureMinutes({
        durationType,
        originalMinutes: hours * 60 + mins,
        playbackSpeed: speed,
        noteOverheadPercent: overhead,
      });

  const unmetPrereqs = chapter.prerequisites.filter((p) => !p.completed);
  const needsPrereqChoice = unmetPrereqs.length > 0 && !uc.prerequisiteChoice;

  async function handleSave() {
    setSaving(true);
    await onSave({
      lectureOriginalMinutes: hours * 60 + mins,
      durationType,
      playbackSpeed: speed,
      noteOverheadPercent: overhead,
      manualOverrideMinutes: manualOverride ? Number(manualOverride) : null,
      lectureProgressMinutes: progressH * 60 + progressM,
    });
    setSaving(false);
  }

  const lecturePct = uc.lectureDurationMinutes > 0 ? (uc.lectureProgressMinutes / uc.lectureDurationMinutes) * 100 : 0;

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggleExpand} className="flex w-full items-start justify-between p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color, backgroundColor: meta.bg }}>
              Bucket {uc.bucket}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Weightage {chapter.weightage}/5</span>
          </div>
          <p className="truncate font-bold text-[#0F172A]">{chapter.name}</p>
          <p className="mt-0.5 text-xs text-[#64748B]">
            {formatMinutesAsHm(uc.lectureProgressMinutes)} / {formatMinutesAsHm(uc.lectureDurationMinutes)} lecture
          </p>
          <div className="mt-2">
            <ProgressBar value={lecturePct} color={meta.color} />
          </div>
        </div>
        <span
          className="ml-3 shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-white"
          style={{ backgroundColor: STATUS_COLOR[uc.status] }}
        >
          {STATUS_LABEL[uc.status]}
        </span>
      </button>

      <div className="flex gap-2 border-t border-slate-100 px-4 py-2 text-xs">
        <Checklist label="Lecture" done={uc.lectureProgressMinutes >= uc.lectureDurationMinutes && uc.lectureDurationMinutes > 0} />
        <Checklist
          label="Practice"
          done={uc.practiceStatus === "done"}
          onClick={() => onSave({ practiceStatus: uc.practiceStatus === "done" ? "pending" : "done" })}
        />
        <Checklist
          label="PYQs"
          done={uc.pyqStatus === "done"}
          onClick={() => onSave({ pyqStatus: uc.pyqStatus === "done" ? "pending" : "done" })}
        />
        <Checklist
          label="Revision"
          done={uc.revisionStatus === "done"}
          onClick={() => onSave({ revisionStatus: uc.revisionStatus === "done" ? "pending" : "done" })}
        />
      </div>

      {needsPrereqChoice && (
        <div className="mx-4 mb-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs">
          <p className="font-semibold text-[#92400E]">Prerequisite Recommended</p>
          <p className="mt-0.5 text-[#92400E]">
            {chapter.name} works best after: {unmetPrereqs.map((p) => p.name).join(", ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => onSave({ prerequisiteChoice: "add_prerequisite" })} className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#92400E] shadow-sm">
              Add Prerequisite
            </button>
            <button onClick={() => onSave({ prerequisiteChoice: "basics_only" })} className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#92400E] shadow-sm">
              Study Required Basics Only
            </button>
            <button onClick={() => onSave({ prerequisiteChoice: "already_know" })} className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#92400E] shadow-sm">
              I Already Know This
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50 p-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Lecture duration</p>
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <span className="text-xs text-[#64748B]">hr</span>
              <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(Number(e.target.value))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <span className="text-xs text-[#64748B]">min</span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">The duration you entered is:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDurationType("original")}
                className={`flex-1 rounded-lg border-2 py-1.5 text-xs font-semibold ${durationType === "original" ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"}`}
              >
                Original video duration
              </button>
              <button
                onClick={() => setDurationType("actual_watch")}
                className={`flex-1 rounded-lg border-2 py-1.5 text-xs font-semibold ${durationType === "actual_watch" ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"}`}
              >
                Actual watch time
              </button>
            </div>
          </div>

          {durationType === "original" && (
            <div>
              <p className="mb-1.5 text-sm font-semibold">Playback speed</p>
              <div className="flex gap-1.5">
                {[1, 1.25, 1.5, 1.75, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`flex-1 rounded-lg border-2 py-1.5 text-xs font-semibold ${speed === s ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-semibold">Note-taking overhead: {overhead}%</p>
            <input type="range" min={0} max={60} value={overhead} onChange={(e) => setOverhead(Number(e.target.value))} className="w-full" />
          </div>

          <div className="rounded-lg bg-white p-3 text-sm">
            Planned time: <span className="font-bold text-[#0284C7]">{formatMinutesAsHm(previewMinutes)}</span>
            <input
              type="number"
              placeholder="Override minutes"
              value={manualOverride}
              onChange={(e) => setManualOverride(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">Lecture progress completed</p>
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={progressH} onChange={(e) => setProgressH(Number(e.target.value))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <span className="text-xs text-[#64748B]">hr</span>
              <input type="number" min={0} max={59} value={progressM} onChange={(e) => setProgressM(Number(e.target.value))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <span className="text-xs text-[#64748B]">min</span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">Confidence</p>
            <div className="grid grid-cols-3 gap-2">
              {(["weak", "average", "strong"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => onSave({ confidence: lvl })}
                  className={`rounded-lg border-2 py-1.5 text-xs font-semibold capitalize ${uc.confidence === lvl ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"}`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">Bucket</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((b) => (
                <button
                  key={b}
                  onClick={() => onSave({ bucket: b })}
                  className={`rounded-lg border-2 py-1.5 text-xs font-semibold ${uc.bucket === b ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"}`}
                >
                  Bucket {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">PYQ time estimate</p>
            <input
              type="number"
              value={uc.pyqMinutes}
              onChange={(e) => onLocalPatch({ pyqMinutes: Number(e.target.value) })}
              onBlur={(e) => onSave({ pyqMinutes: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>

          <Button fullWidth loading={saving} onClick={handleSave}>
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

function Checklist({ label, done, onClick }: { label: string; done: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5"
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-md border-2 text-[10px] font-bold text-white"
        style={{ borderColor: done ? "#22C55E" : "#CBD5E1", backgroundColor: done ? "#22C55E" : "transparent" }}
      >
        {done ? "✓" : ""}
      </span>
      <span className="text-[10px] text-[#64748B]">{label}</span>
    </button>
  );
}
