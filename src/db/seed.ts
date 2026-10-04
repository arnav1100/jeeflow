import "dotenv/config";
import { db, pool } from "./index";
import { subjects, syllabusVersions, chapters, chapterPrerequisites } from "./schema";
import { PHYSICS_CHAPTERS, CHEMISTRY_CHAPTERS, MATHS_CHAPTERS, type SeedChapter } from "./seed-data";
import { eq } from "drizzle-orm";

async function seedSubject(
  slug: string,
  name: string,
  color: string,
  versionId: string,
  list: SeedChapter[],
) {
  const [subject] = await db
    .insert(subjects)
    .values({ slug, name, color })
    .onConflictDoUpdate({ target: subjects.slug, set: { name, color } })
    .returning();

  const nameToId = new Map<string, string>();

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const inserted = await db
      .insert(chapters)
      .values({
        subjectId: subject.id,
        syllabusVersionId: versionId,
        name: c.name,
        slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        weightage: c.weightage,
        defaultBucket: c.bucket,
        defaultLectureMinutes: c.lectureMinutes,
        orderIndex: i,
        sizeCategory: c.size,
      })
      .returning();
    nameToId.set(c.name, inserted[0].id);
  }

  for (const c of list) {
    if (!c.prereqs?.length) continue;
    const chapterId = nameToId.get(c.name);
    if (!chapterId) continue;
    for (const prereqName of c.prereqs) {
      const prereqId = nameToId.get(prereqName);
      if (!prereqId) continue;
      await db.insert(chapterPrerequisites).values({ chapterId, prerequisiteChapterId: prereqId });
    }
  }

  return subject.id;
}

async function main() {
  console.log("Seeding JEEFlow syllabus data...");

  // Clear existing syllabus data (idempotent re-seed for dev)
  await db.delete(chapterPrerequisites);
  await db.delete(chapters);
  await db.delete(syllabusVersions);
  await db.delete(subjects);

  const [version] = await db
    .insert(syllabusVersions)
    .values({ exam: "JEE Main", year: new Date().getFullYear() + 1, version: "official", active: true })
    .returning();

  await seedSubject("physics", "Physics", "#2563EB", version.id, PHYSICS_CHAPTERS);
  await seedSubject("chemistry", "Chemistry", "#16A34A", version.id, CHEMISTRY_CHAPTERS);
  await seedSubject("maths", "Mathematics", "#EA580C", version.id, MATHS_CHAPTERS);

  console.log("Seed complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
