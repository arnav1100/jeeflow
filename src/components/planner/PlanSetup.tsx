"use client";

import {
  useEffect,
  useState,
} from "react";

type SubjectSlug =
  | "maths"
  | "physics"
  | "chemistry";

type ChapterState =
  | "not_started"
  | "partial"
  | "studied";

type RevisionStatus =
  | "pending"
  | "partial"
  | "done";

type Chapter = {
  chapterId: string;
  name: string;
  sequenceOrder: number;

  state: ChapterState;

  lectureDurationMinutes: number;
  lectureProgressMinutes: number;

  lectureDone: boolean;
  practiceDone: boolean;
  pyqDone: boolean;

  revisionStatus: RevisionStatus;
};

type Subject = {
  subjectSlug: SubjectSlug;
  chapters: Chapter[];
};

const SUBJECTS: SubjectSlug[] = [
  "maths",
  "physics",
  "chemistry",
];

const LABELS: Record<
  SubjectSlug,
  string
> = {
  maths: "Maths",
  physics: "Physics",
  chemistry: "Chemistry",
};

function hours(
  minutes: number,
) {
  return Math.round(
    (minutes / 60) * 10,
  ) / 10;
}

export default function PlanSetup({
  onComplete,
  editMode = false,
  onCancel,
}: {
  onComplete?: () => void;
  editMode?: boolean;
  onCancel?: () => void;
}) {
  const [mode, setMode] =
    useState<
      "fresh" | "progress"
    >(
      editMode
        ? "progress"
        : "progress",
    );

  const [
    activeSubject,
    setActiveSubject,
  ] =
    useState<SubjectSlug>(
      "maths",
    );

  const [subjects, setSubjects] =
    useState<Subject[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res =
          await fetch(
            "/api/plan/setup-progress",
            {
              cache:
                "no-store",
            },
          );

        const data =
          await res.json();

        if (!res.ok) {
          throw new Error(
            data.error ??
              "Could not load preparation.",
          );
        }

        if (!cancelled) {
          setSubjects(
            data.subjects ??
              [],
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load preparation.",
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

  const subject =
    subjects.find(
      (item) =>
        item.subjectSlug ===
        activeSubject,
    );

  function updateChapter(
    chapterId: string,
    patch: Partial<Chapter>,
  ) {
    setSubjects(
      (current) =>
        current.map(
          (subject) => ({
            ...subject,

            chapters:
              subject.chapters.map(
                (chapter) =>
                  chapter.chapterId ===
                  chapterId
                    ? {
                        ...chapter,
                        ...patch,
                      }
                    : chapter,
              ),
          }),
        ),
    );
  }

  function setState(
    chapter: Chapter,
    state: ChapterState,
  ) {
    if (
      state ===
      "not_started"
    ) {
      updateChapter(
        chapter.chapterId,
        {
          state,
          lectureProgressMinutes:
            0,
          lectureDone:
            false,
          practiceDone:
            false,
          pyqDone:
            false,
          revisionStatus:
            "pending",
        },
      );

      return;
    }

    if (state === "studied") {
      updateChapter(
        chapter.chapterId,
        {
          state,
          lectureProgressMinutes:
            chapter.lectureDurationMinutes,
          lectureDone: true,
          practiceDone: true,
          pyqDone: true,
        },
      );

      return;
    }

    updateChapter(
      chapter.chapterId,
      {
        state: "partial",
      },
    );
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const payload =
        subjects.flatMap(
          (subject) =>
            subject.chapters.map(
              (chapter) => ({
                chapterId:
                  chapter.chapterId,

                state:
                  chapter.state,

                lectureProgressMinutes:
                  chapter.lectureProgressMinutes,

                lectureDone:
                  chapter.lectureDone,

                practiceDone:
                  chapter.practiceDone,

                pyqDone:
                  chapter.pyqDone,

                revisionStatus:
                  chapter.revisionStatus,
              }),
            ),
        );

      const res =
        await fetch(
          "/api/plan/setup-progress",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              mode,
              ...(mode ===
              "progress"
                ? {
                    chapters:
                      payload,
                  }
                : {}),
            }),
          },
        );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ??
            "Could not save preparation.",
        );
      }

      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save preparation.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-4 text-sm text-[#64748B]">
        Loading preparation…
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h2 className="text-lg font-extrabold">
        {editMode
          ? "Edit preparation"
          : "Set your preparation"}
      </h2>

      <p className="mt-1 text-sm text-[#64748B]">
        Chapters can be completed in
        any order. The planner will
        sequence only what is still
        left.
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {!editMode && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setMode(
                "progress",
              )
            }
            className={`rounded-xl border p-3 text-sm font-bold ${
              mode ===
              "progress"
                ? "border-[#0284C7] bg-[#E0F2FE] text-[#0284C7]"
                : "border-slate-200"
            }`}
          >
            My current progress
          </button>

          <button
            type="button"
            onClick={() =>
              setMode("fresh")
            }
            className={`rounded-xl border p-3 text-sm font-bold ${
              mode ===
              "fresh"
                ? "border-[#0284C7] bg-[#E0F2FE] text-[#0284C7]"
                : "border-slate-200"
            }`}
          >
            Start fresh
          </button>
        </div>
      )}

      {mode === "progress" && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {SUBJECTS.map(
              (slug) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() =>
                    setActiveSubject(
                      slug,
                    )
                  }
                  className={`rounded-lg py-2 text-xs font-bold ${
                    activeSubject ===
                    slug
                      ? "bg-[#0284C7] text-white"
                      : "bg-slate-100 text-[#64748B]"
                  }`}
                >
                  {
                    LABELS[
                      slug
                    ]
                  }
                </button>
              ),
            )}
          </div>

          <div className="mt-4 space-y-2">
            {subject?.chapters.map(
              (chapter) => (
                <div
                  key={
                    chapter.chapterId
                  }
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <p className="text-sm font-bold">
                    {chapter.name}
                  </p>

                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setState(
                          chapter,
                          "not_started",
                        )
                      }
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${
                        chapter.state ===
                        "not_started"
                          ? "bg-slate-800 text-white"
                          : "bg-slate-100"
                      }`}
                    >
                      Not started
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setState(
                          chapter,
                          "partial",
                        )
                      }
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${
                        chapter.state ===
                        "partial"
                          ? "bg-amber-500 text-white"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      Partial
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setState(
                          chapter,
                          "studied",
                        )
                      }
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${
                        chapter.state ===
                        "studied"
                          ? "bg-green-600 text-white"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      ✓ Studied
                    </button>
                  </div>

                  {chapter.state ===
                    "partial" && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateChapter(
                            chapter.chapterId,
                            {
                              lectureDone:
                                !chapter.lectureDone,

                              lectureProgressMinutes:
                                !chapter.lectureDone
                                  ? chapter.lectureDurationMinutes
                                  : 0,
                            },
                          )
                        }
                        className="flex w-full items-center justify-between py-1 text-sm"
                      >
                        <span>
                          Lecture
                        </span>

                        <strong>
                          {chapter.lectureDone
                            ? "✓ Done"
                            : "Pending"}
                        </strong>
                      </button>

                      {!chapter.lectureDone && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={
                              Math.round(
                                (chapter.lectureProgressMinutes /
                                  60) *
                                  10,
                              ) /
                              10
                            }
                            onChange={(
                              e,
                            ) =>
                              updateChapter(
                                chapter.chapterId,
                                {
                                  lectureProgressMinutes:
                                    Math.min(
                                      chapter.lectureDurationMinutes,
                                      Math.max(
                                        0,
                                        Math.round(
                                          Number(
                                            e
                                              .target
                                              .value,
                                          ) *
                                            60,
                                        ),
                                      ),
                                    ),
                                },
                              )
                            }
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                          />

                          <span className="text-xs text-[#64748B]">
                            /{" "}
                            {hours(
                              chapter.lectureDurationMinutes,
                            )}
                            h watched
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          updateChapter(
                            chapter.chapterId,
                            {
                              practiceDone:
                                !chapter.practiceDone,
                            },
                          )
                        }
                        className="mt-2 flex w-full items-center justify-between py-1 text-sm"
                      >
                        <span>
                          Practice /
                          DPP
                        </span>

                        <strong>
                          {chapter.practiceDone
                            ? "✓ Done"
                            : "Pending"}
                        </strong>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateChapter(
                            chapter.chapterId,
                            {
                              pyqDone:
                                !chapter.pyqDone,
                            },
                          )
                        }
                        className="mt-2 flex w-full items-center justify-between py-1 text-sm"
                      >
                        <span>
                          PYQs
                        </span>

                        <strong>
                          {chapter.pyqDone
                            ? "✓ Done"
                            : "Pending"}
                        </strong>
                      </button>
                    </div>
                  )}

                  {chapter.state ===
                    "studied" && (
                    <div className="mt-2 flex gap-2">
                      {(
                        [
                          [
                            "pending",
                            "Revision pending",
                          ],
                          [
                            "partial",
                            "Revision partial",
                          ],
                          [
                            "done",
                            "Revision done",
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
                              updateChapter(
                                chapter.chapterId,
                                {
                                  revisionStatus:
                                    value,
                                },
                              )
                            }
                            className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold ${
                              chapter.revisionStatus ===
                              value
                                ? "bg-[#0284C7] text-white"
                                : "bg-slate-100 text-[#64748B]"
                            }`}
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        </>
      )}

      {mode === "fresh" && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          This will mark every chapter
          as not started.
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {editMode && (
          <button
            type="button"
            disabled={saving}
            onClick={
              onCancel
            }
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="flex-1 rounded-xl bg-[#0284C7] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : "Save preparation"}
        </button>
      </div>
    </div>
  );
}
