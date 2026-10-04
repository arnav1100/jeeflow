import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = rows[0];
  if (!user) return null;

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  return { user, profile: profileRows[0] ?? null };
}

/** Use inside server components that require an authenticated + onboarded user. */
export async function requireOnboardedUser() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile?.onboardingCompleted) redirect("/onboarding");
  return current;
}

export async function requireUser() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}
