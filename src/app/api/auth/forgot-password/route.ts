import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SignJWT } from "jose";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({ email: z.string().trim().email() });
const secretKey = process.env.AUTH_SECRET || "jeeflow-dev-secret-change-in-production-please";
const encodedKey = new TextEncoder().encode(secretKey);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const normalizedEmail = parsed.data.email.toLowerCase();
  const rows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  const user = rows[0];

  // Always respond success to avoid leaking which emails are registered.
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = await new SignJWT({ userId: user.id, purpose: "reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(encodedKey);

  // This project has no transactional email provider configured yet, so the
  // reset link is returned directly in the response for the demo/dev flow.
  const resetUrl = `/reset-password?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ ok: true, devResetUrl: resetUrl });
}
