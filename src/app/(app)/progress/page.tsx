import { requireOnboardedUser } from "@/lib/current-user";
import { getProgressSummary } from "@/lib/data/tasks";
import { getChapterProgress, getLast7Days } from "@/lib/data/progress";
import { todayIST } from "@/lib/date";
import ProgressView from "@/components/progress/ProgressView";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { user } = await requireOnboardedUser();
  const today = todayIST();
  const [summary, chapters, week] = await Promise.all([
    getProgressSummary(user.id),
    getChapterProgress(user.id),
    getLast7Days(user.id, today),
  ]);

  return <ProgressView summary={summary} chapters={chapters} week={week} today={today} />;
}
