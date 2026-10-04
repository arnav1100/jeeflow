import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = rows[0];
  if (!user) return NextResponse.json({ user: null }, { status: 200 });

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);

  return NextResponse.json({ user, profile: profileRows[0] ?? null });
}
