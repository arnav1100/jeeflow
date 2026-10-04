import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  date,
  time,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ============================================================
 * USERS & AUTH
 * ========================================================== */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  name: text("name").notNull().default(""),
  authProvider: text("auth_provider").notNull().default("password"), // password | google
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email),
]);

/* ============================================================
 * PROFILES (onboarding data)
 * ========================================================== */

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  targetExam: text("target_exam").notNull().default("JEE Main"),
  targetYear: integer("target_year").notNull().default(new Date().getFullYear() + 1),
  targetDate: date("target_date"),
  studentType: text("student_type").notNull().default("class12"), // dropper | class12 | class11
  physicsLevel: text("physics_level").notNull().default("average"), // weak | average | strong
  chemistryLevel: text("chemistry_level").notNull().default("average"),
  mathsLevel: text("maths_level").notNull().default("average"),
  targetScore: integer("target_score").notNull().default(200),
  strategy: text("strategy").notNull().default("full_syllabus"),
  planDurationDays: integer("plan_duration_days").notNull().default(60),
  customDeadline: date("custom_deadline"),
  onboardingStep: integer("onboarding_step").notNull().default(0),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  noteOverheadPercent: integer("note_overhead_percent").notNull().default(20),
  revisionIntervalsDays: jsonb("revision_intervals_days").$type<number[]>().notNull().default([3, 7, 15]),
  revisionMinutesPerSession: integer("revision_minutes_per_session").notNull().default(30),
  strategyConfig: jsonb("strategy_config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
 * SYLLABUS: SUBJECTS / VERSIONS / CHAPTERS / PREREQUISITES
 * ========================================================== */

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(), // physics | chemistry | maths
  name: text("name").notNull(),
  color: text("color").notNull(), // tailwind-ish hex
}, (table) => [
  uniqueIndex("subjects_slug_unique").on(table.slug),
]);

export const syllabusVersions = pgTable("syllabus_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  exam: text("exam").notNull().default("JEE Main"),
  year: integer("year").notNull(),
  version: text("version").notNull().default("official"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  syllabusVersionId: uuid("syllabus_version_id").references(() => syllabusVersions.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  weightage: integer("weightage").notNull().default(2), // 1-5 relative weightage used by priority engine
  defaultBucket: integer("default_bucket").notNull().default(2), // 1 foundation, 2 high-weightage, 3 moderate
  defaultLectureMinutes: integer("default_lecture_minutes").notNull().default(360),
  orderIndex: integer("order_index").notNull().default(0),
  sizeCategory: text("size_category").notNull().default("medium"), // small | medium | large (for PYQ time defaults)
}, (table) => [
  index("chapters_subject_idx").on(table.subjectId),
]);

export const chapterPrerequisites = pgTable("chapter_prerequisites", {
  id: uuid("id").primaryKey().defaultRandom(),
  chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  prerequisiteChapterId: uuid("prerequisite_chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
});

/* ============================================================
 * USER <-> CHAPTER PROGRESS
 * ========================================================== */

export const userChapters = pgTable("user_chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),

  // lecture time configuration
  lectureOriginalMinutes: integer("lecture_original_minutes").notNull().default(360),
  lectureDurationMinutes: integer("lecture_duration_minutes").notNull().default(360),
  lectureProgressMinutes: integer("lecture_progress_minutes").notNull().default(0),
  durationType: text("duration_type").notNull().default("original"), // original | actual_watch
  playbackSpeed: real("playback_speed").notNull().default(1),
  noteOverheadPercent: integer("note_overhead_percent").notNull().default(20),
  manualOverrideMinutes: integer("manual_override_minutes"),

  practiceMinutes: integer("practice_minutes").notNull().default(60),
  practiceStatus: text("practice_status").notNull().default("pending"), // pending | done
  pyqMinutes: integer("pyq_minutes").notNull().default(90),
  pyqStatus: text("pyq_status").notNull().default("pending"), // pending | done
  revisionStatus: text("revision_status").notNull().default("pending"), // pending | partial | done

  confidence: text("confidence").notNull().default("average"), // weak | average | strong
  bucket: integer("bucket").notNull().default(2),
  status: text("status").notNull().default("not_started"),
  // not_started | in_progress | lecture_done | pyq_pending | revision_pending | completed

  prerequisiteChoice: text("prerequisite_choice"), // add_prerequisite | basics_only | already_know | null

  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_chapters_user_chapter_unique").on(table.userId, table.chapterId),
  index("user_chapters_user_idx").on(table.userId),
]);

/* ============================================================
 * AVAILABILITY & FIXED EVENTS
 * ========================================================== */

export const availability = pgTable("availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday ... 6=Saturday
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
}, (table) => [
  index("availability_user_idx").on(table.userId),
]);

export const fixedEvents = pgTable("fixed_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"), // coaching | school | gym | tuition | travel | sleep | other
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull().default([]),
}, (table) => [
  index("fixed_events_user_idx").on(table.userId),
]);

/* ============================================================
 * PYQ SETTINGS
 * ========================================================== */

export const pyqSettings = pgTable("pyq_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  years: jsonb("years").$type<string[]>().notNull().default(["2025", "2024", "2023"]),
  source: text("source").notNull().default("ExamGoal"),
  smallChapterMinutes: integer("small_chapter_minutes").notNull().default(50),
  mediumChapterMinutes: integer("medium_chapter_minutes").notNull().default(90),
  largeChapterMinutes: integer("large_chapter_minutes").notNull().default(135),
});

/* ============================================================
 * STUDY PLANS & TASKS
 * ========================================================== */

export const studyPlans = pgTable("study_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  strategy: text("strategy").notNull().default("full_syllabus"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalAvailableMinutes: integer("total_available_minutes").notNull().default(0),
  totalRequiredMinutes: integer("total_required_minutes").notNull().default(0),
  status: text("status").notNull().default("active"), // active | archived
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("study_plans_user_idx").on(table.userId),
]);

export const studyTasks = pgTable("study_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => studyPlans.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
  subjectSlug: text("subject_slug").notNull().default("physics"),
  taskType: text("task_type").notNull(), // lecture | practice | pyq | revision | test
  title: text("title").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull().default(60),
  completedMinutes: integer("completed_minutes").notNull().default(0),
  scheduledDate: date("scheduled_date").notNull(),
  startTime: time("start_time"),
  status: text("status").notNull().default("pending"), // pending | in_progress | done | skipped | rescheduled
  priority: integer("priority").notNull().default(50),
  revisionNumber: integer("revision_number"),
  isBacklog: boolean("is_backlog").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("study_tasks_user_date_idx").on(table.userId, table.scheduledDate),
  index("study_tasks_plan_idx").on(table.planId),
]);

/* ============================================================
 * REVISION SCHEDULE
 * ========================================================== */

export const revisionSchedule = pgTable("revision_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(), // 1,2,3,4(mixed test)
  intervalDays: integer("interval_days").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("pending"), // pending | scheduled | done | skipped
  taskId: uuid("task_id").references(() => studyTasks.id, { onDelete: "set null" }),
}, (table) => [
  index("revision_schedule_user_idx").on(table.userId),
]);

/* ============================================================
 * TESTS
 * ========================================================== */

export const tests = pgTable("tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  testDate: date("test_date").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(180),
  travelMinutes: integer("travel_minutes").notNull().default(0),
  syllabus: text("syllabus"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tests_user_idx").on(table.userId),
]);

export const testResults = pgTable("test_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  testId: uuid("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  physicsMarks: integer("physics_marks").notNull().default(0),
  chemistryMarks: integer("chemistry_marks").notNull().default(0),
  mathsMarks: integer("maths_marks").notNull().default(0),
  totalMarks: integer("total_marks").notNull().default(0),
  physicsAccuracy: real("physics_accuracy"),
  chemistryAccuracy: real("chemistry_accuracy"),
  mathsAccuracy: real("maths_accuracy"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testMistakes = pgTable("test_mistakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  testId: uuid("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  subjectSlug: text("subject_slug").notNull().default("physics"),
  mistakeType: text("mistake_type").notNull(), // concept | calculation | silly | time_management | unattempted
  count: integer("count").notNull().default(1),
  notes: text("notes"),
});

/* ============================================================
 * RELATIONS
 * ========================================================== */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  userChapters: many(userChapters),
  availability: many(availability),
  fixedEvents: many(fixedEvents),
  studyPlans: many(studyPlans),
  tests: many(tests),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  subject: one(subjects, { fields: [chapters.subjectId], references: [subjects.id] }),
  prerequisites: many(chapterPrerequisites, { relationName: "chapter_prereqs" }),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  chapters: many(chapters),
}));

export const testsRelations = relations(tests, ({ many }) => ({
  results: many(testResults),
  mistakes: many(testMistakes),
}));
