"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { DAY_LABELS, DEFAULT_STATE_SEED, FixedEventDraft, OnboardingState } from "./types";

const STORAGE_KEY = "jeeflow_onboarding_draft";
const TOTAL_STEPS = 7;

const STRATEGIES: { value: OnboardingState["strategy"]; label: string; desc: string }[] = [
  { value: "full_syllabus", label: "Full Syllabus", desc: "Cover every chapter in a balanced order." },
  { value: "bucket_strategy", label: "Bucket Strategy", desc: "Focus on chosen priority buckets first." },
  { value: "high_weightage_first", label: "High Weightage First", desc: "Chase maximum-return chapters first." },
  { value: "backlog_completion", label: "Backlog Completion", desc: "Finish chapters you've already started." },
  { value: "revision_focus", label: "Revision Focus", desc: "Prioritize PYQs and spaced revision." },
  { value: "custom_chapters", label: "Custom Chapters", desc: "Pick exactly which chapters to plan." },
];

const DURATIONS = [30, 45, 60, 90, 120];
const SCORE_PRESETS = [150, 180, 200, 220, 250];
const CATEGORIES: FixedEventDraft["category"][] = ["coaching", "school", "gym", "tuition", "travel", "sleep", "other"];

export default function OnboardingWizard({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(() => DEFAULT_STATE_SEED(initialName));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setState((prev) => ({ ...prev, ...parsed }));
      } catch {
        // ignore corrupt draft
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function update<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  async function handleFinish() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save onboarding.");
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const canNext = useMemo(() => {
    if (step === 0) return state.name.trim().length > 0 && !!state.targetDate;
    return true;
  }, [step, state]);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#64748B]">
          <span>Step {step + 1} of {TOTAL_STEPS}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-[#0284C7] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="card p-6">
        {step === 0 && <StepBasicInfo state={state} update={update} />}
        {step === 1 && <StepStudentType state={state} update={update} />}
        {step === 2 && <StepAvailability state={state} update={update} />}
        {step === 3 && <StepCommitments state={state} update={update} />}
        {step === 4 && <StepConfidence state={state} update={update} />}
        {step === 5 && <StepTarget state={state} update={update} />}
        {step === 6 && <StepStrategy state={state} update={update} />}

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[#EF4444]">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          {step < TOTAL_STEPS - 1 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}>
              Next
            </Button>
          ) : (
            <Button onClick={handleFinish} loading={loading}>
              Finish &amp; Go to Dashboard
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

function StepBasicInfo({ state, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Basic information</h2>
      <Input label="Name" value={state.name} onChange={(e) => update("name", e.target.value)} />
      <Input label="Target exam" value={state.targetExam} onChange={(e) => update("targetExam", e.target.value)} />
      <Input
        label="Target year"
        type="number"
        value={state.targetYear}
        onChange={(e) => update("targetYear", Number(e.target.value))}
      />
      <Input
        label="Target attempt date"
        type="date"
        value={state.targetDate}
        onChange={(e) => update("targetDate", e.target.value)}
        hint={`Example: ${state.targetExam} ${state.targetYear}`}
      />
    </div>
  );
}

function StepStudentType({ state, update }: StepProps) {
  const options: { value: OnboardingState["studentType"]; label: string; desc: string }[] = [
    { value: "dropper", label: "Dropper", desc: "Focused full-time preparation." },
    { value: "class12", label: "Class 12", desc: "Balancing school + JEE prep." },
    { value: "class11", label: "Class 11", desc: "Building a strong foundation." },
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">What describes you best?</h2>
      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => update("studentType", opt.value)}
            className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
              state.studentType === opt.value ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"
            }`}
          >
            <p className="font-semibold text-[#0F172A]">{opt.label}</p>
            <p className="text-sm text-[#64748B]">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepAvailability({ state, update }: StepProps) {
  function setWindow(dayIdx: number, winIdx: number, key: "start" | "end", value: string) {
    const next = state.availability.map((d, i) =>
      i === dayIdx
        ? { ...d, windows: d.windows.map((w, j) => (j === winIdx ? { ...w, [key]: value } : w)) }
        : d,
    );
    update("availability", next);
  }
  function addWindow(dayIdx: number) {
    const next = state.availability.map((d, i) =>
      i === dayIdx ? { ...d, windows: [...d.windows, { start: "19:00", end: "20:00" }] } : d,
    );
    update("availability", next);
  }
  function removeWindow(dayIdx: number, winIdx: number) {
    const next = state.availability.map((d, i) =>
      i === dayIdx ? { ...d, windows: d.windows.filter((_, j) => j !== winIdx) } : d,
    );
    update("availability", next);
  }
  function hoursForDay(dayIdx: number) {
    const mins = state.availability[dayIdx].windows.reduce((sum, w) => {
      const [sh, sm] = w.start.split(":").map(Number);
      const [eh, em] = w.end.split(":").map(Number);
      return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
    }, 0);
    return (mins / 60).toFixed(1);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Daily availability</h2>
      <p className="text-sm text-[#64748B]">Add your free study windows for each day. These should already exclude school, coaching, gym etc.</p>
      <div className="space-y-4">
        {state.availability.map((d, i) => (
          <div key={d.dayOfWeek} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">{DAY_LABELS[d.dayOfWeek]}</p>
              <span className="text-xs font-medium text-[#0284C7]">{hoursForDay(i)}h</span>
            </div>
            <div className="space-y-2">
              {d.windows.map((w, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={w.start}
                    onChange={(e) => setWindow(i, j, "start", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-[#94A3B8]">to</span>
                  <input
                    type="time"
                    value={w.end}
                    onChange={(e) => setWindow(i, j, "end", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  {d.windows.length > 1 && (
                    <button type="button" onClick={() => removeWindow(i, j)} className="text-xs text-[#EF4444]">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => addWindow(i)} className="mt-2 text-xs font-semibold text-[#0284C7]">
              + Add window
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCommitments({ state, update }: StepProps) {
  function addEvent() {
    const newEvent: FixedEventDraft = {
      id: crypto.randomUUID(),
      title: "Coaching",
      category: "coaching",
      start: "16:00",
      end: "18:00",
      days: [1, 2, 3, 4, 5],
    };
    update("fixedEvents", [...state.fixedEvents, newEvent]);
  }
  function updateEvent(id: string, patch: Partial<FixedEventDraft>) {
    update(
      "fixedEvents",
      state.fixedEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }
  function removeEvent(id: string) {
    update("fixedEvents", state.fixedEvents.filter((e) => e.id !== id));
  }
  function toggleDay(id: string, day: number) {
    const ev = state.fixedEvents.find((e) => e.id === id);
    if (!ev) return;
    const days = ev.days.includes(day) ? ev.days.filter((d) => d !== day) : [...ev.days, day];
    updateEvent(id, { days });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Fixed commitments</h2>
      <p className="text-sm text-[#64748B]">Optional — add recurring events like coaching, school, or gym for your weekly planner view.</p>
      <div className="space-y-3">
        {state.fixedEvents.map((ev) => (
          <div key={ev.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={ev.title}
                onChange={(e) => updateEvent(ev.id, { title: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="Title"
              />
              <select
                value={ev.category}
                onChange={(e) => updateEvent(ev.id, { category: e.target.value as FixedEventDraft["category"] })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm capitalize"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeEvent(ev.id)} className="text-xs text-[#EF4444]">
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={ev.start}
                onChange={(e) => updateEvent(ev.id, { start: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-[#94A3B8]">to</span>
              <input
                type="time"
                value={ev.end}
                onChange={(e) => updateEvent(ev.id, { end: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(ev.id, idx)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    ev.days.includes(idx) ? "bg-[#0284C7] text-white" : "bg-slate-100 text-[#64748B]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addEvent} className="text-sm font-semibold text-[#0284C7]">
        + Add commitment
      </button>
    </div>
  );
}

function StepConfidence({ state, update }: StepProps) {
  const subjects: { key: "physicsLevel" | "chemistryLevel" | "mathsLevel"; label: string }[] = [
    { key: "physicsLevel", label: "Physics" },
    { key: "chemistryLevel", label: "Chemistry" },
    { key: "mathsLevel", label: "Mathematics" },
  ];
  const levels: OnboardingState["physicsLevel"][] = ["weak", "average", "strong"];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Current confidence</h2>
      {subjects.map((s) => (
        <div key={s.key}>
          <p className="mb-2 text-sm font-semibold text-[#0F172A]">{s.label}</p>
          <div className="grid grid-cols-3 gap-2">
            {levels.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => update(s.key, lvl)}
                className={`rounded-xl border-2 py-2 text-sm font-medium capitalize transition-colors ${
                  state[s.key] === lvl ? "border-[#38BDF8] bg-[#E0F2FE] text-[#0284C7]" : "border-slate-200 text-[#64748B]"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepTarget({ state, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Target score</h2>
      <div className="grid grid-cols-3 gap-2">
        {SCORE_PRESETS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => update("targetScore", s)}
            className={`rounded-xl border-2 py-2 text-sm font-semibold transition-colors ${
              state.targetScore === s ? "border-[#38BDF8] bg-[#E0F2FE] text-[#0284C7]" : "border-slate-200 text-[#64748B]"
            }`}
          >
            {s}+
          </button>
        ))}
      </div>
      <Input
        label="Custom target"
        type="number"
        value={state.targetScore}
        onChange={(e) => update("targetScore", Number(e.target.value))}
      />
    </div>
  );
}

function StepStrategy({ state, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Study strategy</h2>
        <div className="mt-3 space-y-2">
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => update("strategy", s.value)}
              className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                state.strategy === s.value ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"
              }`}
            >
              <p className="font-semibold text-[#0F172A]">{s.label}</p>
              <p className="text-xs text-[#64748B]">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {state.strategy === "bucket_strategy" && (
        <div>
          <p className="mb-2 text-sm font-semibold">Select buckets</p>
          <div className="flex gap-2">
            {[1, 2, 3].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() =>
                  update(
                    "selectedBuckets",
                    state.selectedBuckets.includes(b)
                      ? state.selectedBuckets.filter((x) => x !== b)
                      : [...state.selectedBuckets, b],
                  )
                }
                className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium ${
                  state.selectedBuckets.includes(b) ? "border-[#38BDF8] bg-[#E0F2FE]" : "border-slate-200"
                }`}
              >
                Bucket {b}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Plan duration</p>
        <div className="grid grid-cols-3 gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => update("planDurationDays", d)}
              className={`rounded-xl border-2 py-2 text-sm font-semibold transition-colors ${
                state.planDurationDays === d ? "border-[#38BDF8] bg-[#E0F2FE] text-[#0284C7]" : "border-slate-200 text-[#64748B]"
              }`}
            >
              {d} days
            </button>
          ))}
          <button
            type="button"
            onClick={() => update("planDurationDays", 0)}
            className={`rounded-xl border-2 py-2 text-sm font-semibold transition-colors ${
              state.planDurationDays === 0 ? "border-[#38BDF8] bg-[#E0F2FE] text-[#0284C7]" : "border-slate-200 text-[#64748B]"
            }`}
          >
            Custom
          </button>
        </div>
        {state.planDurationDays === 0 && (
          <Input
            className="mt-3"
            type="date"
            label="Custom deadline"
            value={state.customDeadline}
            onChange={(e) => update("customDeadline", e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

interface StepProps {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}
