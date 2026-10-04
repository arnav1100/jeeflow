import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildEngineChapters } from "@/lib/data/plan-context";
import type { SubjectSlug } from "@/lib/scheduling/types";

export const dynamic = "force-dynamic";

const SUBJECTS: SubjectSlug[] = [
  "maths",
  "physics",
  "chemistry",
];

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Not authenticated.",
      },
      { status: 401 },
    );
  }

  const chapters =
    await buildEngineChapters(
      session.userId,
    );

  /*
   * IMPORTANT:
   *
   * This endpoint is NOT asking:
   * "Which chapter is currently incomplete?"
   *
   * It is asking:
   * "For which NEXT chapter do we still need
   * lecture duration?"
   *
   * Example:
   *
   * Sets
   * Lecture ✓
   * Practice pending
   * PYQ pending
   *
   * Sets remains the active study chapter,
   * but we no longer need its lecture duration.
   *
   * So duration setup can move ahead to:
   * Quadratic Equations.
   */
  const nextChapters = SUBJECTS
    .map((subject) => {
      const queue = chapters
        .filter(
          (chapter) =>
            chapter.subjectSlug ===
              subject &&
            chapter.remainingLectureMinutes >
              0,
        )
        .sort(
          (a, b) =>
            a.sequenceOrder -
            b.sequenceOrder,
        );

      const chapter = queue[0];

      if (!chapter) {
        return null;
      }

      return {
        chapterId:
          chapter.chapterId,

        subjectSlug:
          chapter.subjectSlug,

        name:
          chapter.name,

        sequenceOrder:
          chapter.sequenceOrder,

        lectureDurationMinutes:
          chapter.lectureDurationMinutes,

        lectureProgressMinutes:
          chapter.lectureProgressMinutes,

        remainingLectureMinutes:
          chapter.remainingLectureMinutes,

        manualDurationSet:
          chapter.manualDurationSet,
      };
    })
    .filter(
      (
        chapter,
      ): chapter is NonNullable<
        typeof chapter
      > => chapter !== null,
    );

  return NextResponse.json({
    chapters: nextChapters,
  });
}
