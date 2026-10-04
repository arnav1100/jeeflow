import Link from "next/link";
import { requireOnboardedUser } from "@/lib/current-user";
import { getActivePlan, getProgressSummary, getTasksForPlan } from "@/lib/data/tasks";
import { todayIST, daysBetween, formatDayLabel } from "@/lib/date";
import ProgressBar from "@/components/ui/ProgressBar";
import TodayBoard from "@/components/dashboard/TodayBoard";
import { subjectMeta } from "@/lib/subjects";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<number, string> = {
  1: "Bucket 1 · Foundation",
  2: "Bucket 2 · High weightage",
  3: "Bucket 3 · Moderate",
};

export default async function DashboardPage() {
  const { user, profile } = await requireOnboardedUser();
  const today = todayIST();

  const [plan, progress] = await Promise.all([getActivePlan(user.id), getProgressSummary(user.id)]);
  const tasks = plan ? await getTasksForPlan(user.id, plan.id) : [];

  const todayTasks = tasks.filter((t) => t.scheduledDate === today);
  const backlog = tasks.filter((t) => t.scheduledDate < today && t.status !== "done" && t.status !== "skipped");

  const firstName = (profile?.name || user.name || "").trim().split(" ")[0];
  const targetDate = profile?.targetDate as unknown as string | null;
  const daysLeft = targetDate ? daysBetween(today, targetDate) : null;

  return (
    <div className="pb-6">
      <p className="text-sm text-[#64748B]">{formatDayLabel(today, { weekday: "long" })}</p>
      <h1 className="text-2xl font-extrabold">{firstName ? `Hi, ${firstName}` : "Welcome back"}</h1>
      {daysLeft !== null && daysLeft >= 0 && (
        <p className="mt-1 text-sm text-[#64748B]">
          <span className="font-semibold text-[#0284C7]">{daysLeft}</span> days to {profile?.targetExam ?? "JEE Main"}
        </p>
      )}

      <TodayBoard
        key={`${plan?.id ?? "none"}-${today}`}
        initialToday={todayTasks}
        initialBacklog={backlog}
        hasPlan={Boolean(plan)}
      />

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-base font-bold">Syllabus progress</h2>
        <span className="text-sm font-semibold text-[#0284C7]">{progress.overallPercent}% overall</span>
      </div>
      <div className="card mt-2 space-y-4 p-4">
        {progress.bySubject.map((s) => {
          const meta = subjectMeta(s.slug);
          return (
            <div key={s.slug}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="text-xs text-[#64748B]">
                  {s.completed}/{s.total} chapters · {s.percent}%
                </span>
              </div>
              <ProgressBar value={s.percent} color={meta.color} />
            </div>
          );
        })}
      </div>

      <h2 className="mt-6 text-base font-bold">By bucket</h2>
      <div className="card mt-2 space-y-4 p-4">
        {progress.byBucket.map((b) => (
          <div key={b.bucket}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-semibold">{BUCKET_LABEL[b.bucket]}</span>
              <span className="text-xs text-[#64748B]">
                {b.completed}/{b.total} · {b.percent}%
              </span>
            </div>
            <ProgressBar value={b.percent} />
          </div>
        ))}
      </div>

      <Link href="/planner" className="mt-6 block rounded-xl bg-[#E0F2FE] py-3 text-center text-sm font-semibold text-[#0284C7]">
        Open full planner
      </Link>
    </div>
  );
}
