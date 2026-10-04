import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * One DB round-trip (users LEFT JOIN profiles), and memoised per request with React cache():
 * the (app) layout and the page both call this, but it only hits the database once.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const rows = await db
    .select({ user: users, profile: profiles })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, session.userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { user: row.user, profile: row.profile ?? null };
});

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
