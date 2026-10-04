import { requireOnboardedUser } from "@/lib/current-user";
import { getActivePlan, getTasksForPlan } from "@/lib/data/tasks";
import { getStudyDate } from "@/lib/study-day";
import PlannerView, { type PlanSummary } from "@/components/planner/PlannerView";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const { user, profile } = await requireOnboardedUser();
  const plan = await getActivePlan(user.id);
  const tasks = plan ? await getTasksForPlan(user.id, plan.id) : [];

  const config = (plan?.config ?? {}) as { suggestedDays?: number | null };
  const summary: PlanSummary | null = plan
    ? {
        id: plan.id,
        strategy: plan.strategy,
        startDate: plan.startDate as unknown as string,
        endDate: plan.endDate as unknown as string,
        totalAvailableMinutes: plan.totalAvailableMinutes,
        totalRequiredMinutes: plan.totalRequiredMinutes,
        warnings: plan.warnings ?? [],
        suggestedDays: typeof config.suggestedDays === "number" ? config.suggestedDays : null,
      }
    : null;

  return (
    <PlannerView
      key={plan?.id ?? "none"}
      plan={summary}
      initialTasks={tasks}
      today={getStudyDate()}
      defaultStrategy={profile?.strategy ?? "full_syllabus"}
      defaultDays={profile?.planDurationDays || 60}
    />
  );
}
