import {
  NextRequest,
  NextResponse,
} from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { db } from "@/db";
import {
  profiles,
  userChapters,
} from "@/db/schema";
import { buildEngineChapters } from "@/lib/data/plan-context";
import { computeChapterStatus } from "@/lib/scheduling/chapter-status";
import type { SubjectSlug } from "@/lib/scheduling/types";

export const dynamic = "force-dynamic";

const SUBJECTS: SubjectSlug[] = [
  "maths",
  "physics",
  "chemistry",
];

const chapterSchema = z.object({
  chapterId: z.string().uuid(),

  state: z.enum([
    "not_started",
    "partial",
    "studied",
  ]),

  lectureProgressMinutes: z
    .number()
    .int()
    .min(0)
    .optional(),

  lectureDone: z.boolean(),
  practiceDone: z.boolean(),
  pyqDone: z.boolean(),

  revisionStatus: z.enum([
    "pending",
    "partial",
    "done",
  ]),
});

const patchSchema = z.object({
  mode: z.enum([
    "fresh",
    "progress",
  ]),

  chapters: z
    .array(chapterSchema)
    .optional(),
});

export async function GET() {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  const [engineChapters, profileRows] =
    await Promise.all([
      buildEngineChapters(
        session.userId,
      ),

      db
        .select()
        .from(profiles)
        .where(
          eq(
            profiles.userId,
            session.userId,
          ),
        )
        .limit(1),
    ]);

  const profile =
    profileRows[0];

  const strategyConfig =
    (profile?.strategyConfig as Record<
      string,
      unknown
    >) ?? {};

  const setupCompleted =
    strategyConfig.plannerSetupCompleted ===
    true;

  const subjects =
    SUBJECTS.map(
      (subjectSlug) => ({
        subjectSlug,

        chapters:
          engineChapters
            .filter(
              (chapter) =>
                chapter.subjectSlug ===
                subjectSlug,
            )
            .sort(
              (a, b) =>
                a.sequenceOrder -
                b.sequenceOrder,
            )
            .map(
              (chapter) => {
                const lectureDone =
                  chapter.remainingLectureMinutes ===
                  0;

                const practiceDone =
                  chapter.practicePendingMinutes ===
                  0;

                const pyqDone =
                  chapter.pyqPendingMinutes ===
                  0;

                const coreDone =
                  lectureDone &&
                  practiceDone &&
                  pyqDone;

                const state:
                  | "not_started"
                  | "partial"
                  | "studied" =
                  coreDone
                    ? "studied"
                    : chapter.lectureProgressMinutes >
                          0 ||
                        practiceDone ||
                        pyqDone
                      ? "partial"
                      : "not_started";

                return {
                  chapterId:
                    chapter.chapterId,

                  name:
                    chapter.name,

                  sequenceOrder:
                    chapter.sequenceOrder,

                  state,

                  lectureDurationMinutes:
                    chapter.lectureDurationMinutes,

                  lectureProgressMinutes:
                    chapter.lectureProgressMinutes,

                  lectureDone,
                  practiceDone,
                  pyqDone,

                  revisionStatus:
                    chapter.revisionStatus,
                };
              },
            ),
      }),
    );

  return NextResponse.json({
    setupCompleted,
    subjects,
  });
}

export async function PATCH(
  req: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  const body =
    await req
      .json()
      .catch(() => ({}));

  const parsed =
    patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]
            ?.message ??
          "Invalid preparation data.",
      },
      { status: 400 },
    );
  }

  const input =
    parsed.data;

  const now = new Date();

  if (input.mode === "fresh") {
    await db
      .update(userChapters)
      .set({
        lectureProgressMinutes: 0,
        practiceStatus: "pending",
        pyqStatus: "pending",
        revisionStatus: "pending",
        status: "not_started",
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        eq(
          userChapters.userId,
          session.userId,
        ),
      );
  } else {
    if (!input.chapters) {
      return NextResponse.json(
        {
          error:
            "Chapter progress is required.",
        },
        { status: 400 },
      );
    }

    const existingRows =
      await db
        .select()
        .from(userChapters)
        .where(
          eq(
            userChapters.userId,
            session.userId,
          ),
        );

    const existingMap =
      new Map(
        existingRows.map(
          (row) => [
            row.chapterId,
            row,
          ],
        ),
      );

    await db.transaction(
      async (tx) => {
        await Promise.all(
          input.chapters!.map(
            async (chapter) => {
              const existing =
                existingMap.get(
                  chapter.chapterId,
                );

              if (!existing) {
                return;
              }

              let lectureProgress = 0;
              let practiceStatus =
                "pending";
              let pyqStatus =
                "pending";

              if (
                chapter.state ===
                "studied"
              ) {
                lectureProgress =
                  existing.lectureDurationMinutes;

                practiceStatus =
                  "done";

                pyqStatus =
                  "done";
              }

              if (
                chapter.state ===
                "partial"
              ) {
                lectureProgress =
                  chapter.lectureDone
                    ? existing.lectureDurationMinutes
                    : Math.min(
                        existing.lectureDurationMinutes,
                        Math.max(
                          0,
                          chapter.lectureProgressMinutes ??
                            0,
                        ),
                      );

                practiceStatus =
                  chapter.practiceDone
                    ? "done"
                    : "pending";

                pyqStatus =
                  chapter.pyqDone
                    ? "done"
                    : "pending";
              }

              const revisionStatus =
                chapter.revisionStatus;

              const status =
                computeChapterStatus({
                  lectureDurationMinutes:
                    existing.lectureDurationMinutes,

                  lectureProgressMinutes:
                    lectureProgress,

                  practiceStatus,

                  pyqStatus,

                  revisionStatus,
                });

              await tx
                .update(userChapters)
                .set({
                  lectureProgressMinutes:
                    lectureProgress,

                  practiceStatus,
                  pyqStatus,
                  revisionStatus,
                  status,

                  startedAt:
                    status ===
                    "not_started"
                      ? null
                      : existing.startedAt ??
                        now,

                  completedAt:
                    status ===
                    "completed"
                      ? existing.completedAt ??
                        now
                      : null,

                  updatedAt: now,
                })
                .where(
                  and(
                    eq(
                      userChapters.userId,
                      session.userId,
                    ),
                    eq(
                      userChapters.chapterId,
                      chapter.chapterId,
                    ),
                  ),
                );
            },
          ),
        );
      },
    );
  }

  const profileRows =
    await db
      .select()
      .from(profiles)
      .where(
        eq(
          profiles.userId,
          session.userId,
        ),
      )
      .limit(1);

  const currentConfig =
    (profileRows[0]?.strategyConfig as Record<
      string,
      unknown
    >) ?? {};

  await db
    .update(profiles)
    .set({
      strategyConfig: {
        ...currentConfig,
        plannerSetupCompleted:
          true,
      },
      updatedAt: now,
    })
    .where(
      eq(
        profiles.userId,
        session.userId,
      ),
    );

  return NextResponse.json({
    ok: true,
    mode: input.mode,
  });
}
