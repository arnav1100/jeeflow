import { db } from "@/db";
import { chapters, subjects, userChapters, chapterPrerequisites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeChapterStatus } from "@/lib/scheduling/chapter-status";
import type { ChapterStatus, ConfidenceLevel, SubjectSlug } from "@/lib/scheduling/types";

export interface ChapterView {
  chapterId: string;
  name: string;
  subjectSlug: SubjectSlug;
  subjectColor: string;
  weightage: number;
  defaultBucket: number;
  sizeCategory: string;
  orderIndex: number;
  prerequisites: { id: string; name: string; completed: boolean }[];
  userChapter: {
    id: string;
    lectureOriginalMinutes: number;
    lectureDurationMinutes: number;
    lectureProgressMinutes: number;
    durationType: string;
    playbackSpeed: number;
    noteOverheadPercent: number;
    manualOverrideMinutes: number | null;
    practiceMinutes: number;
    practiceStatus: string;
    pyqMinutes: number;
    pyqStatus: string;
    revisionStatus: string;
    confidence: ConfidenceLevel;
    bucket: number;
    prerequisiteChoice: string | null;
    status: ChapterStatus;
  } | null;
}

export async function getChaptersForUser(userId: string): Promise<ChapterView[]> {
  const allSubjects = await db.select().from(subjects);
  const allChapters = await db.select().from(chapters);
  const allUserChapters = await db.select().from(userChapters).where(eq(userChapters.userId, userId));
  const allPrereqs = await db.select().from(chapterPrerequisites);

  const subjectById = new Map(allSubjects.map((s) => [s.id, s]));
  const userChapterByChapterId = new Map(allUserChapters.map((uc) => [uc.chapterId, uc]));
  const chapterById = new Map(allChapters.map((c) => [c.id, c]));

  const prereqsByChapter = new Map<string, string[]>();
  for (const p of allPrereqs) {
    const list = prereqsByChapter.get(p.chapterId) ?? [];
    list.push(p.prerequisiteChapterId);
    prereqsByChapter.set(p.chapterId, list);
  }

  return allChapters
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((c) => {
      const subject = subjectById.get(c.subjectId);
      const uc = userChapterByChapterId.get(c.id);
      const prereqIds = prereqsByChapter.get(c.id) ?? [];
      const prereqs = prereqIds
        .map((id) => chapterById.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => {
          const prereqUc = userChapterByChapterId.get(p.id);
          return { id: p.id, name: p.name, completed: prereqUc?.status === "completed" };
        });

      const status: ChapterStatus = uc
        ? computeChapterStatus({
            lectureDurationMinutes: uc.lectureDurationMinutes,
            lectureProgressMinutes: uc.lectureProgressMinutes,
            practiceStatus: uc.practiceStatus,
            pyqStatus: uc.pyqStatus,
            revisionStatus: uc.revisionStatus,
          })
        : "not_started";

      return {
        chapterId: c.id,
        name: c.name,
        subjectSlug: (subject?.slug as SubjectSlug) ?? "physics",
        subjectColor: subject?.color ?? "#64748B",
        weightage: c.weightage,
        defaultBucket: c.defaultBucket,
        sizeCategory: c.sizeCategory,
        orderIndex: c.orderIndex,
        prerequisites: prereqs,
        userChapter: uc
          ? {
              id: uc.id,
              lectureOriginalMinutes: uc.lectureOriginalMinutes,
              lectureDurationMinutes: uc.lectureDurationMinutes,
              lectureProgressMinutes: uc.lectureProgressMinutes,
              durationType: uc.durationType,
              playbackSpeed: uc.playbackSpeed,
              noteOverheadPercent: uc.noteOverheadPercent,
              manualOverrideMinutes: uc.manualOverrideMinutes,
              practiceMinutes: uc.practiceMinutes,
              practiceStatus: uc.practiceStatus,
              pyqMinutes: uc.pyqMinutes,
              pyqStatus: uc.pyqStatus,
              revisionStatus: uc.revisionStatus,
              confidence: uc.confidence as ConfidenceLevel,
              bucket: uc.bucket,
              prerequisiteChoice: uc.prerequisiteChoice,
              status,
            }
          : null,
      };
    });
}
