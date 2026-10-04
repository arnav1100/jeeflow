import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { availability, profiles, users } from "@/db/schema";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time");
const windowSchema = z
  .object({ start: time, end: time })
  .refine((w) => w.end > w.start, { message: "A study window must end after it starts." });

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  targetExam: z.string().trim().min(1).max(60),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  targetScore: z.number().int().min(0).max(300),
  studentType: z.enum(["dropper", "class12", "class11"]),
  physicsLevel: z.enum(["weak", "average", "strong"]),
  chemistryLevel: z.enum(["weak", "average", "strong"]),
  mathsLevel: z.enum(["weak", "average", "strong"]),
  planDurationDays: z.number().int().min(7).max(365),
  availability: z
    .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), windows: z.array(windowSchema).max(6) }))
    .length(7),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const userId = session.userId;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const d = parsed.data;
  const now = new Date();

  await db
    .update(profiles)
    .set({
      name: d.name,
      targetExam: d.targetExam,
      targetDate: d.targetDate,
      targetScore: d.targetScore,
      studentType: d.studentType,
      physicsLevel: d.physicsLevel,
      chemistryLevel: d.chemistryLevel,
      mathsLevel: d.mathsLevel,
      planDurationDays: d.planDurationDays,
      updatedAt: now,
    })
    .where(eq(profiles.userId, userId));
  await db.update(users).set({ name: d.name, updatedAt: now }).where(eq(users.id, userId));

  await db.delete(availability).where(eq(availability.userId, userId));
  const rows = d.availability.flatMap((day) =>
    day.windows.map((w) => ({ userId, dayOfWeek: day.dayOfWeek, startTime: w.start, endTime: w.end })),
  );
  if (rows.length > 0) await db.insert(availability).values(rows);

  return NextResponse.json({ ok: true });
}
