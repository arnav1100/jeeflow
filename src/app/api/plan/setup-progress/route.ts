import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildEngineChapters } from "@/lib/data/plan-context";
import type { SubjectSlug } from "@/lib/scheduling/types";

export const dynamic = "force-dynamic";

const SUBJECT_ORDER: SubjectSlug[] = [
  "maths",
  "physics",
  "chemistry",
];

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  const chapters =
    await buildEngineChapters(
      session.userId,
    );

  const subjects = SUBJECT_ORDER.map(
    (subjectSlug) => {
      const subjectChapters = chapters
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
        .map((chapter) => ({
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
        }));

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
