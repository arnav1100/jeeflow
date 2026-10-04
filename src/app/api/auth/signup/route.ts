import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingRows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingRows.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ name, email: normalizedEmail, passwordHash, authProvider: "password" })
      .returning();

    await db.insert(profiles).values({ userId: user.id, name });

    const token = await createSessionToken({ userId: user.id, email: user.email }, true);
    await setSessionCookie(token, true);

    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("signup error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
