import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jwtVerify } from "jose";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

const schema = z.object({ token: z.string(), password: z.string().min(6) });
const secretKey = process.env.AUTH_SECRET || "jeeflow-dev-secret-change-in-production-please";
const encodedKey = new TextEncoder().encode(secretKey);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const { payload } = await jwtVerify(parsed.data.token, encodedKey);
    if (payload.purpose !== "reset" || typeof payload.userId !== "string") {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, payload.userId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }
}
