import { requireOnboardedUser } from "@/lib/current-user";
import { db } from "@/db";
import { availability } from "@/db/schema";
import { eq } from "drizzle-orm";
import ProfileForm, { type ProfileData } from "@/components/profile/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, profile } = await requireOnboardedUser();
  const rows = await db.select().from(availability).where(eq(availability.userId, user.id));

  const byDay: ProfileData["availability"] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    windows: rows
      .filter((r) => r.dayOfWeek === dayOfWeek)
      .map((r) => ({ start: r.startTime.slice(0, 5), end: r.endTime.slice(0, 5) }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  }));

  const initial: ProfileData = {
    email: user.email,
    name: profile?.name || user.name,
    targetExam: profile?.targetExam ?? "JEE Main",
    targetDate: (profile?.targetDate as unknown as string | null) ?? "",
    targetScore: profile?.targetScore ?? 200,
    studentType: profile?.studentType ?? "class12",
    physicsLevel: profile?.physicsLevel ?? "average",
    chemistryLevel: profile?.chemistryLevel ?? "average",
    mathsLevel: profile?.mathsLevel ?? "average",
    planDurationDays: profile?.planDurationDays ?? 60,
    availability: byDay,
  };

  return <ProfileForm initial={initial} />;
}
