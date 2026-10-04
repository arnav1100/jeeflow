import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getChaptersForUser } from "@/lib/data/chapters";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const result = await getChaptersForUser(session.userId);
  return NextResponse.json({ chapters: result });
}
