"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import TimeInput from "@/components/ui/TimeInput";

export interface ProfileData {
  email: string;
  name: string;
  targetExam: string;
  targetDate: string; // yyyy-mm-dd or ""
  targetScore: number;
  studentType: string;
  physicsLevel: string;
  chemistryLevel: string;
  mathsLevel: string;
  planDurationDays: number;
  availability: { dayOfWeek: number; windows: { start: string; end: string }[] }[];
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEVELS = [
  { value: "weak", label: "Weak" },
  { value: "average", label: "Average" },
  { value: "strong", label: "Strong" },
];
const STUDENT_TYPES = [
  { value: "dropper", label: "Dropper" },
  { value: "class12", label: "Class 12" },
  { value: "class11", label: "Class 11" },
];

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
            value === o.value ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-slate-200 bg-white text-[#475569]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ProfileForm({ initial }: { initial: ProfileData }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function set<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus(null);
  }

  function updateWindows(dayOfWeek: number, fn: (w: { start: string; end: string }[]) => { start: string; end: string }[]) {
    setForm((f) => ({
      ...f,
      availability: f.availability.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, windows: fn(d.windows) } : d)),
    }));
    setStatus(null);
  }

  const weeklyMinutes = useMemo(
    () =>
      form.availability.reduce(
        (sum, d) => sum + d.windows.reduce((s, w) => s + Math.max(0, toMin(w.end) - toMin(w.start)), 0),
        0,
      ),
    [form.availability],
  );

  async function save() {
    for (const d of form.availability) {
      for (const w of d.windows) {
        if (!w.start || !w.end || toMin(w.end) <= toMin(w.start)) {
          setStatus({ type: "error", text: `${DAY_NAME[d.dayOfWeek]}: each study window must end after it starts.` });
          return;
        }
      }
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          targetExam: form.targetExam,
          targetDate: form.targetDate || null,
          targetScore: Number(form.targetScore) || 0,
          studentType: form.studentType,
          physicsLevel: form.physicsLevel,
          chemistryLevel: form.chemistryLevel,
          mathsLevel: form.mathsLevel,
          planDurationDays: Number(form.planDurationDays) || 60,
          availability: form.availability,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", text: data.error ?? "Could not save." });
      } else {
        setStatus({ type: "ok", text: "Saved." });
        router.refresh();
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-extrabold">Profile</h1>
      <p className="mt-1 text-sm text-[#64748B]">{form.email}</p>

      <section className="card mt-4 space-y-4 p-4">
        <h2 className="text-base font-bold">About you</h2>
        <Input label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <div>
          <p className="mb-1.5 text-sm font-medium">I am a</p>
          <Segmented value={form.studentType} options={STUDENT_TYPES} onChange={(v) => set("studentType", v)} />
        </div>
      </section>

      <section className="card mt-4 space-y-4 p-4">
        <h2 className="text-base font-bold">Exam goal</h2>
        <Input label="Target exam" value={form.targetExam} onChange={(e) => set("targetExam", e.target.value)} />
        <Input
          label="Exam date"
          type="date"
          value={form.targetDate}
          onChange={(e) => set("targetDate", e.target.value)}
          hint="Shown as a countdown on your dashboard."
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Target score"
            type="number"
            inputMode="numeric"
            min={0}
            max={300}
            value={form.targetScore}
            onChange={(e) => set("targetScore", Number(e.target.value))}
          />
          <Input
            label="Plan length (days)"
            type="number"
            inputMode="numeric"
            min={7}
            max={365}
            value={form.planDurationDays}
            onChange={(e) => set("planDurationDays", Number(e.target.value))}
          />
        </div>
      </section>

      <section className="card mt-4 space-y-4 p-4">
        <h2 className="text-base font-bold">Subject confidence</h2>
        {(
          [
            ["physicsLevel", "Physics"],
            ["chemistryLevel", "Chemistry"],
            ["mathsLevel", "Mathematics"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <p className="mb-1.5 text-sm font-medium">{label}</p>
            <Segmented value={form[key]} options={LEVELS} onChange={(v) => set(key, v)} />
          </div>
        ))}
        <p className="text-xs text-[#64748B]">Per-chapter confidence can still be changed from the Syllabus tab.</p>
      </section>

      <section className="card mt-4 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">Daily study time</h2>
          <span className="text-sm font-semibold text-[#0284C7]">{Math.round((weeklyMinutes / 60) * 10) / 10} h / week</span>
        </div>
        <p className="mt-1 text-xs text-[#64748B]">The planner only schedules tasks inside these windows.</p>

        <div className="mt-3 space-y-3">
          {DAY_ORDER.map((dow) => {
            const day = form.availability.find((d) => d.dayOfWeek === dow)!;
            const mins = day.windows.reduce((s, w) => s + Math.max(0, toMin(w.end) - toMin(w.start)), 0);
            return (
              <div key={dow} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{DAY_NAME[dow]}</span>
                  <span className="text-xs text-[#64748B]">{mins ? `${Math.round((mins / 60) * 10) / 10} h` : "Off"}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {day.windows.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimeInput value={w.start} onChange={(v) => updateWindows(dow, (ws) => ws.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                      <span className="text-xs text-[#64748B]">to</span>
                      <TimeInput value={w.end} onChange={(v) => updateWindows(dow, (ws) => ws.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                      <button
                        type="button"
                        aria-label="Remove window"
                        onClick={() => updateWindows(dow, (ws) => ws.filter((_, j) => j !== i))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-slate-100 hover:text-[#EF4444]"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => updateWindows(dow, (ws) => [...ws, { start: "18:00", end: "21:00" }])}
                  className="mt-2 text-xs font-semibold text-[#0284C7]"
                >
                  + Add study window
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {status && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${status.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
        >
          {status.text}
          {status.type === "ok" && (
            <>
              {" "}
              Study time and goal changes apply to your next plan —{" "}
              <Link href="/planner" className="font-semibold underline">
                regenerate it in the Planner
              </Link>
              .
            </>
          )}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <Button fullWidth size="lg" loading={saving} onClick={save}>
          Save changes
        </Button>
        <Button fullWidth variant="ghost" loading={loggingOut} onClick={logout}>
          Log out
        </Button>
      </div>
    </div>
  );
}
