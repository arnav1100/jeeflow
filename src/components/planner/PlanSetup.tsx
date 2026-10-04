"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type SubjectSlug =
  | "maths"
  | "physics"
  | "chemistry";

type SetupMode =
  | "fresh"
  | "progress"
  | null;

type LectureState =
  | "not_started"
  | "in_progress"
  | "done";

type SetupChapter = {
  chapterId: string;
  name: string;
  sequenceOrder: number;
  status: string;

  lectureDurationMinutes: number;
  lectureProgressMinutes: number;

  lectureComplete: boolean;
  practiceComplete: boolean;
  pyqComplete: boolean;

  revisionStatus: string;
  manualDurationSet: boolean;
};

type SetupSubject = {
  subjectSlug: SubjectSlug;
  chapters: SetupChapter[];
};

type SubjectDraft = {
  currentChapterId: string;

  lectureState: LectureState;

  lectureProgressHours: string;

  practiceDone: boolean;
  pyqDone: boolean;
};

const SUBJECT_ORDER: SubjectSlug[] = [
  "maths",
  "physics",
  "chemistry",
];

const LABELS: Record<
  SubjectSlug,
  string
> = {
  maths: "Mathematics",
  physics: "Physics",
  chemistry: "Chemistry",
};

const SHORT_LABELS: Record<
  SubjectSlug,
  string
> = {
  maths: "Maths",
  physics: "Physics",
  chemistry: "Chemistry",
};

function minutesToHours(
  minutes: number,
): string {
  const hours = minutes / 60;

  if (Number.isInteger(hours)) {
    return String(hours);
  }

  return String(
    Math.round(hours * 10) / 10,
  );
}

function getLectureState(
  chapter: SetupChapter,
): LectureState {
  if (chapter.lectureComplete) {
    return "done";
  }

  if (
    chapter.lectureProgressMinutes >
    0
  ) {
    return "in_progress";
  }

  return "not_started";
}

export default function PlanSetup({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [mode, setMode] =
    useState<SetupMode>(null);

  const [subjects, setSubjects] =
    useState<SetupSubject[]>([]);

  const [drafts, setDrafts] =
    useState<
      Partial<
        Record<
          SubjectSlug,
          SubjectDraft
        >
      >
    >({});

  const [
    activeSubjectIndex,
    setActiveSubjectIndex,
  ] = useState(0);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [saved, setSaved] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          "/api/plan/setup-progress",
          {
            cache: "no-store",
          },
        );

        const data =
          await res.json();

        if (!res.ok) {
          throw new Error(
            data.error ??
              "Could not load chapters.",
          );
        }

        if (cancelled) {
          return;
        }

        const loadedSubjects: SetupSubject[] =
          data.subjects ?? [];

        setSubjects(
          loadedSubjects,
        );

        const initialDrafts:
          Partial<
            Record<
              SubjectSlug,
              SubjectDraft
            >
          > = {};

        for (const subject of loadedSubjects) {
          /*
           * Find first chapter whose
           * lecture/practice/PYQ are not
           * all complete.
           */
          const current =
            subject.chapters.find(
              (chapter) =>
                !(
                  chapter.lectureComplete &&
                  chapter.practiceComplete &&
                  chapter.pyqComplete
                ),
            ) ??
            subject.chapters[
              subject.chapters.length -
                1
            ];

          if (!current) {
            continue;
          }

          initialDrafts[
            subject.subjectSlug
          ] = {
            currentChapterId:
              current.chapterId,

            lectureState:
              getLectureState(
                current,
              ),

            lectureProgressHours:
              minutesToHours(
                current.lectureProgressMinutes,
              ),

            practiceDone:
              current.practiceComplete,

            pyqDone:
              current.pyqComplete,
          };
        }

        setDrafts(
          initialDrafts,
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load setup.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSlug =
    SUBJECT_ORDER[
      activeSubjectIndex
    ];

  const activeSubject =
    useMemo(
      () =>
        subjects.find(
          (subject) =>
            subject.subjectSlug ===
            activeSlug,
        ),
      [
        subjects,
        activeSlug,
      ],
    );

  const activeDraft =
    drafts[activeSlug];

  const activeChapter =
    activeSubject?.chapters.find(
      (chapter) =>
        chapter.chapterId ===
        activeDraft
          ?.currentChapterId,
    );

  function updateDraft(
    subject: SubjectSlug,
    patch: Partial<SubjectDraft>,
  ) {
    setDrafts((current) => {
      const existing =
        current[subject];

      if (!existing) {
        return current;
      }

      return {
        ...current,

        [subject]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function selectChapter(
    chapterId: string,
  ) {
    if (!activeSubject) {
      return;
    }

    const chapter =
      activeSubject.chapters.find(
        (item) =>
          item.chapterId ===
          chapterId,
      );

    if (!chapter) {
      return;
    }

    updateDraft(
      activeSlug,
      {
        currentChapterId:
          chapter.chapterId,

        lectureState:
          getLectureState(
            chapter,
          ),

        lectureProgressHours:
          minutesToHours(
            chapter.lectureProgressMinutes,
          ),

        practiceDone:
          chapter.practiceComplete,

        pyqDone:
          chapter.pyqComplete,
      },
    );
  }

  function validateSubject(
    subject: SubjectSlug,
  ): string | null {
    const draft =
      drafts[subject];

    const subjectData =
      subjects.find(
        (item) =>
          item.subjectSlug ===
          subject,
      );

    if (
      !draft ||
      !subjectData
    ) {
      return `Set your ${LABELS[subject]} progress.`;
    }

    const chapter =
      subjectData.chapters.find(
        (item) =>
          item.chapterId ===
          draft.currentChapterId,
      );

    if (!chapter) {
      return `Select your current ${LABELS[subject]} chapter.`;
    }

    if (
      draft.lectureState ===
      "in_progress"
    ) {
      const hours =
        Number(
          draft.lectureProgressHours,
        );

      if (
        !Number.isFinite(hours) ||
        hours <= 0
      ) {
        return `Enter how many lecture hours you have completed in ${chapter.name}.`;
      }

      const progressMinutes =
        Math.round(
          hours * 60,
        );

      if (
        progressMinutes >=
        chapter.lectureDurationMinutes
      ) {
        return `${chapter.name}: if the full lecture is already finished, choose "Lecture done".`;
      }
    }

    return null;
  }

  function goNextSubject() {
    const validation =
      validateSubject(
        activeSlug,
      );

    if (validation) {
      setError(validation);
      return;
    }

    setError(null);

    setActiveSubjectIndex(
      (index) =>
        Math.min(
          SUBJECT_ORDER.length -
            1,
          index + 1,
        ),
    );
  }

  async function saveFresh() {
    if (
      !window.confirm(
        "Start from the beginning? This will reset your saved chapter study progress for Maths, Physics and Chemistry.",
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/plan/setup-progress",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            mode: "fresh",
          }),
        },
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ??
            "Could not reset progress.",
        );
      }

      setSaved(true);

      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save setup.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveProgress() {
    for (const subject of SUBJECT_ORDER) {
      const validation =
        validateSubject(
          subject,
        );

      if (validation) {
        setError(
          validation,
        );

        setActiveSubjectIndex(
          SUBJECT_ORDER.indexOf(
            subject,
          ),
        );

        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const payload =
        SUBJECT_ORDER.map(
          (subjectSlug) => {
            const draft =
              drafts[
                subjectSlug
              ]!;

            return {
              subjectSlug,

              currentChapterId:
                draft.currentChapterId,

              lectureState:
                draft.lectureState,

              lectureProgressMinutes:
                draft.lectureState ===
                "in_progress"
                  ? Math.round(
                      Number(
                        draft.lectureProgressHours,
                      ) * 60,
                    )
                  : undefined,

              practiceDone:
                draft.practiceDone,

              pyqDone:
                draft.pyqDone,
            };
          },
        );

      const res = await fetch(
        "/api/plan/setup-progress",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            mode: "progress",
            subjects:
              payload,
          }),
        },
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ??
            "Could not save progress.",
        );
      }

      setSaved(true);

      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save progress.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-[#64748B]">
          Loading your syllabus…
        </p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p className="font-bold text-green-800">
          Progress saved.
        </p>

        <p className="mt-1 text-sm text-green-700">
          Your planner can now start
          from the right chapters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">
          Where should your plan
          start?
        </h2>

        <p className="mt-1 text-sm text-[#64748B]">
          Choose a fresh start or
          continue from what you have
          already studied.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          setMode("fresh")
        }
        className={`w-full rounded-2xl border p-4 text-left ${
          mode === "fresh"
            ? "border-[#0284C7] bg-[#E0F2FE]"
            : "border-slate-200 bg-white"
        }`}
      >
        <p className="font-bold">
          Start from the beginning
        </p>

        <p className="mt-1 text-xs text-[#64748B]">
          Start Maths, Physics and
          Chemistry from their first
          chapters.
        </p>
      </button>

      {mode === "fresh" && (
        <button
          type="button"
          disabled={saving}
          onClick={saveFresh}
          className="w-full rounded-xl bg-[#0284C7] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : "Use fresh start"}
        </button>
      )}

      <button
        type="button"
        onClick={() =>
          setMode("progress")
        }
        className={`w-full rounded-2xl border p-4 text-left ${
          mode === "progress"
            ? "border-[#0284C7] bg-[#E0F2FE]"
            : "border-slate-200 bg-white"
        }`}
      >
        <p className="font-bold">
          Continue from my progress
        </p>

        <p className="mt-1 text-xs text-[#64748B]">
          Tell us your current
          position in each subject.
        </p>
      </button>

      {mode === "progress" &&
        activeSubject &&
        activeDraft &&
        activeChapter && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              {SUBJECT_ORDER.map(
                (
                  subject,
                  index,
                ) => (
                  <button
                    key={
                      subject
                    }
                    type="button"
                    onClick={() =>
                      setActiveSubjectIndex(
                        index,
                      )
                    }
                    className={`flex-1 rounded-lg py-2 text-xs font-bold ${
                      index ===
                      activeSubjectIndex
                        ? "bg-[#0284C7] text-white"
                        : "bg-slate-100 text-[#64748B]"
                    }`}
                  >
                    {
                      SHORT_LABELS[
                        subject
                      ]
                    }
                  </button>
                ),
              )}
            </div>

            <h3 className="mt-5 font-bold">
              {
                LABELS[
                  activeSlug
                ]
              }
            </h3>

            <label className="mt-4 block text-xs font-semibold text-[#64748B]">
              Which chapter are you
              currently on?
            </label>

            <select
              value={
                activeDraft.currentChapterId
              }
              onChange={(e) =>
                selectChapter(
                  e.target.value,
                )
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            >
              {activeSubject.chapters.map(
                (chapter) => (
                  <option
                    key={
                      chapter.chapterId
                    }
                    value={
                      chapter.chapterId
                    }
                  >
                    {
                      chapter.name
                    }
                  </option>
                ),
              )}
            </select>

            <div className="mt-5">
              <p className="text-xs font-semibold text-[#64748B]">
                Lecture status
              </p>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    [
                      "not_started",
                      "Not started",
                    ],
                    [
                      "in_progress",
                      "In progress",
                    ],
                    [
                      "done",
                      "Done",
                    ],
                  ] as const
                ).map(
                  ([
                    value,
                    label,
                  ]) => (
                    <button
                      key={
                        value
                      }
                      type="button"
                      onClick={() =>
                        updateDraft(
                          activeSlug,
                          {
                            lectureState:
                              value,

                            lectureProgressHours:
                              value ===
                              "in_progress"
                                ? activeDraft.lectureProgressHours ||
                                  ""
                                : "",
                          },
                        )
                      }
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                        activeDraft.lectureState ===
                        value
                          ? "border-[#0284C7] bg-[#E0F2FE] text-[#0284C7]"
                          : "border-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>

            {activeDraft.lectureState ===
              "in_progress" && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-[#64748B]">
                  Lecture hours
                  completed
                </label>

                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    inputMode="decimal"
                    value={
                      activeDraft.lectureProgressHours
                    }
                    onChange={(
                      e,
                    ) =>
                      updateDraft(
                        activeSlug,
                        {
                          lectureProgressHours:
                            e
                              .target
                              .value,
                        },
                      )
                    }
                    className="w-28 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />

                  <span className="text-sm text-[#64748B]">
                    /{" "}
                    {minutesToHours(
                      activeChapter.lectureDurationMinutes,
                    )}
                    h estimated
                  </span>
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  updateDraft(
                    activeSlug,
                    {
                      practiceDone:
                        !activeDraft.practiceDone,
                    },
                  )
                }
                className={`rounded-xl border p-3 text-left ${
                  activeDraft.practiceDone
                    ? "border-green-300 bg-green-50"
                    : "border-slate-200"
                }`}
              >
                <p className="text-xs text-[#64748B]">
                  Practice / DPP
                </p>

                <p className="mt-1 text-sm font-bold">
                  {activeDraft.practiceDone
                    ? "✓ Done"
                    : "Pending"}
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateDraft(
                    activeSlug,
                    {
                      pyqDone:
                        !activeDraft.pyqDone,
                    },
                  )
                }
                className={`rounded-xl border p-3 text-left ${
                  activeDraft.pyqDone
                    ? "border-green-300 bg-green-50"
                    : "border-slate-200"
                }`}
              >
                <p className="text-xs text-[#64748B]">
                  PYQs
                </p>

                <p className="mt-1 text-sm font-bold">
                  {activeDraft.pyqDone
                    ? "✓ Done"
                    : "Pending"}
                </p>
              </button>
            </div>

            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-[#64748B]">
              Chapters before{" "}
              <strong>
                {
                  activeChapter.name
                }
              </strong>{" "}
              will be treated as
              studied. Their revisions
              can still continue in the
              background.
            </p>

            <div className="mt-5 flex gap-2">
              {activeSubjectIndex >
                0 && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveSubjectIndex(
                      (
                        index,
                      ) =>
                        index -
                        1,
                    )
                  }
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
                >
                  Back
                </button>
              )}

              {activeSubjectIndex <
              SUBJECT_ORDER.length -
                1 ? (
                <button
                  type="button"
                  onClick={
                    goNextSubject
                  }
                  className="flex-1 rounded-xl bg-[#0284C7] px-4 py-3 text-sm font-bold text-white"
                >
                  Next:{" "}
                  {
                    SHORT_LABELS[
                      SUBJECT_ORDER[
                        activeSubjectIndex +
                          1
                      ]
                    ]
                  }
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={
                    saveProgress
                  }
                  className="flex-1 rounded-xl bg-[#0284C7] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving
                    ? "Saving…"
                    : "Save progress"}
                </button>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
