import {
  NextRequest,
  NextResponse,
} from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { db } from "@/db";
import {
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

const subjectSchema = z.object({
  subjectSlug: z.enum([
    "maths",
    "physics",
    "chemistry",
  ]),

  currentChapterId:
    z.string().uuid(),

  lectureState: z.enum([
    "not_started",
    "in_progress",
    "done",
  ]),

  lectureProgressMinutes:
    z.number()
      .int()
      .min(0)
      .optional(),

  practiceDone:
    z.boolean(),

  pyqDone:
    z.boolean(),
});

const patchSchema = z.object({
  mode: z.enum([
    "fresh",
    "progress",
  ]),

  subjects:
    z.array(subjectSchema)
      .optional(),
});

/**
 * Read current planner setup/progress.
 */
export async function GET() {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Not authenticated.",
      },
      { status: 401 },
    );
  }

  const chapters =
    await buildEngineChapters(
      session.userId,
    );

  const subjects =
    SUBJECTS.map(
      (subjectSlug) => {
        const subjectChapters =
          chapters
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
              (chapter) => ({
                chapterId:
                  chapter.chapterId,

                name:
                  chapter.name,

                sequenceOrder:
                  chapter.sequenceOrder,

                status:
                  chapter.status,

                lectureDurationMinutes:
                  chapter.lectureDurationMinutes,

                lectureProgressMinutes:
                  chapter.lectureProgressMinutes,

                lectureComplete:
                  chapter.remainingLectureMinutes ===
                  0,

                practiceComplete:
                  chapter.practicePendingMinutes ===
                  0,

                pyqComplete:
                  chapter.pyqPendingMinutes ===
                  0,

                revisionStatus:
                  chapter.revisionStatus,

                manualDurationSet:
                  chapter.manualDurationSet,
              }),
            );

        return {
          subjectSlug,
          chapters:
            subjectChapters,
        };
      },
    );

  return NextResponse.json({
    subjects,
  });
}

/**
 * Save "fresh start" or student's current
 * subject position.
 */
export async function PATCH(
  req: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Not authenticated.",
      },
      { status: 401 },
    );
  }

  const body =
    await req
      .json()
      .catch(() => ({}));

  const parsed =
    patchSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]
            ?.message ??
          "Invalid setup.",
      },
      { status: 400 },
    );
  }

  const input =
    parsed.data;

  const chapters =
    await buildEngineChapters(
      session.userId,
    );

  /**
   * FRESH START
   *
   * Reset study progress for every chapter.
   * Durations/settings are preserved.
   */
  if (input.mode === "fresh") {
    await db
      .update(userChapters)
      .set({
        lectureProgressMinutes: 0,
        practiceStatus:
          "pending",
        pyqStatus:
          "pending",
        revisionStatus:
          "pending",
        status:
          "not_started",
        startedAt: null,
        completedAt: null,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          userChapters.userId,
          session.userId,
        ),
      );

    return NextResponse.json({
      ok: true,
      mode: "fresh",
    });
  }

  if (
    !input.subjects ||
    input.subjects.length !== 3
  ) {
    return NextResponse.json(
      {
        error:
          "Progress is required for all three subjects.",
      },
      { status: 400 },
    );
  }

  const now = new Date();

  await db.transaction(
    async (tx) => {
      for (const setup of input.subjects!) {
        const subjectChapters =
          chapters
            .filter(
              (chapter) =>
                chapter.subjectSlug ===
                setup.subjectSlug,
            )
            .sort(
              (a, b) =>
                a.sequenceOrder -
                b.sequenceOrder,
            );

        const currentIndex =
          subjectChapters.findIndex(
            (chapter) =>
              chapter.chapterId ===
              setup.currentChapterId,
          );

        if (
          currentIndex < 0
        ) {
          throw new Error(
            `Invalid chapter for ${setup.subjectSlug}.`,
          );
        }

        /*
         * Chapters before selected current chapter:
         *
         * Core study considered done.
         * Revisions remain pending.
         */
        for (
          let i = 0;
          i < currentIndex;
          i++
        ) {
          const chapter =
            subjectChapters[i];

          await tx
            .update(userChapters)
            .set({
              lectureProgressMinutes:
                chapter.lectureDurationMinutes,

              practiceStatus:
                "done",

              pyqStatus:
                "done",

              revisionStatus:
                "pending",

              status:
                "revision_pending",

              startedAt:
                now,

              completedAt:
                null,

              updatedAt:
                now,
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
        }

        /*
         * Current selected chapter.
         */
        const current =
          subjectChapters[
            currentIndex
          ];

        let lectureProgress =
          0;

        if (
          setup.lectureState ===
          "done"
        ) {
          lectureProgress =
            current.lectureDurationMinutes;
        }

        if (
          setup.lectureState ===
          "in_progress"
        ) {
          lectureProgress =
            Math.min(
              current.lectureDurationMinutes,
              Math.max(
                0,
                setup.lectureProgressMinutes ??
                  0,
              ),
            );
        }

        const practiceStatus =
          setup.practiceDone
            ? "done"
            : "pending";

        const pyqStatus =
          setup.pyqDone
            ? "done"
            : "pending";

        const revisionStatus =
          "pending";

        const status =
          computeChapterStatus({
            lectureDurationMinutes:
              current.lectureDurationMinutes,

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
                : now,

            completedAt:
              null,

            updatedAt:
              now,
          })
          .where(
            and(
              eq(
                userChapters.userId,
                session.userId,
              ),
              eq(
                userChapters.chapterId,
                current.chapterId,
              ),
            ),
          );

        /*
         * Everything AFTER current chapter
         * becomes not started.
         */
        for (
          let i =
            currentIndex + 1;
          i <
          subjectChapters.length;
          i++
        ) {
          const chapter =
            subjectChapters[i];

          await tx
            .update(userChapters)
            .set({
              lectureProgressMinutes:
                0,

              practiceStatus:
                "pending",

              pyqStatus:
                "pending",

              revisionStatus:
                "pending",

              status:
                "not_started",

              startedAt:
                null,

              completedAt:
                null,

              updatedAt:
                now,
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
        }
      }
    },
  );

  return NextResponse.json({
    ok: true,
    mode: "progress",
  });
}
