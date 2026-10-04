import { requireOnboardedUser } from "@/lib/current-user";
import { getChaptersForUser } from "@/lib/data/chapters";
import SyllabusBoard from "@/components/syllabus/SyllabusBoard";

export const dynamic = "force-dynamic";

export default async function SyllabusPage() {
  const { user } = await requireOnboardedUser();
  const chapters = await getChaptersForUser(user.id);

  return <SyllabusBoard initialChapters={chapters} />;
}
