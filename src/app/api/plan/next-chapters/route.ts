import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildEngineChapters } from "@/lib/data/plan-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  const chapters = await buildEngineChapters(
    session.userId,
  );

  const subjects = [
    "maths",
    "physics",
    "chemistry",
  ] as const;

  const nextChapters = subjects
    .map((subject) => {
      const queue = chapters
        .filter(
          (chapter) =>
            chapter.subjectSlug === subject &&
            chapter.status !== "completed",
        )
        .sort(
          (a, b) =>
            a.sequenceOrder - b.sequenceOrder,
        );

      const chapter = queue[0];

      if (!chapter) return null;

      return {
        chapterId: chapter.chapterId,
        subjectSlug: chapter.subjectSlug,
        name: chapter.name,
        sequenceOrder: chapter.sequenceOrder,
        estimatedMinutes:
          chapter.remainingLectureMinutes,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    chapters: nextChapters,
  });
}
