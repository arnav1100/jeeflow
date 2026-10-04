"use client";

import {
  useEffect,
  useState,
} from "react";

type SubjectSlug =
  | "maths"
  | "physics"
  | "chemistry";

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

type SetupMode =
  | "fresh"
  | "progress"
  | null;

const LABELS: Record<
  SubjectSlug,
  string
> = {
  maths: "Mathematics",
  physics: "Physics",
  chemistry: "Chemistry",
};

const COLORS: Record<
  SubjectSlug,
  string
> = {
  maths:
    "border-violet-200 bg-violet-50",
  physics:
    "border-blue-200 bg-blue-50",
  chemistry:
    "border-emerald-200 bg-emerald-50",
};

export default function PlanSetup({
  onContinue,
}: {
  onContinue?: (
    mode: Exclude<
      SetupMode,
      null
    >,
  ) => void;
}) {
  const [mode, setMode] =
    useState<SetupMode>(null);

  const [subjects, setSubjects] =
    useState<SetupSubject[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null,
    );

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
              "Could not load progress.",
          );
        }

        if (!cancelled) {
          setSubjects(
            data.subjects ?? [],
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load progress.",
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">
          How should we start?
        </h2>

        <p className="mt-1 text-sm text-[#64748B]">
          We&apos;ll use this to
          start your chapter sequence
          from the right place.
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          setMode("fresh")
        }
        className={`w-full rounded-2xl border p-4 text-left transition ${
          mode === "fresh"
            ? "border-[#0284C7] bg-[#E0F2FE]"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="text-sm font-bold">
          Start full syllabus from
          the beginning
        </div>

        <div className="mt-1 text-xs text-[#64748B]">
          Start each subject from
          its first chapter.
        </div>
      </button>

      <button
        type="button"
        onClick={() =>
          setMode("progress")
        }
        className={`w-full rounded-2xl border p-4 text-left transition ${
          mode === "progress"
            ? "border-[#0284C7] bg-[#E0F2FE]"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="text-sm font-bold">
          Continue from my current
          progress
        </div>

        <div className="mt-1 text-xs text-[#64748B]">
          Tell us where you are in
          Maths, Physics and
          Chemistry.
        </div>
      </button>

      {mode === "progress" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold">
            Your current progress
          </h3>

          <p className="mt-1 text-xs text-[#64748B]">
            You&apos;ll review one
            subject at a time — not
            all chapters at once.
          </p>

          {loading && (
            <p className="mt-4 text-sm text-[#64748B]">
              Loading chapters…
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {!loading &&
            !error && (
              <div className="mt-4 space-y-3">
                {subjects.map(
                  (subject) => {
                    const started =
                      subject.chapters.filter(
                        (chapter) =>
                          chapter.status !==
                          "not_started",
                      );

                    const coreDone =
                      subject.chapters.filter(
                        (chapter) =>
                          chapter.lectureComplete &&
                          chapter.practiceComplete &&
                          chapter.pyqComplete,
                      );

                    const current =
                      subject.chapters.find(
                        (chapter) =>
                          !(
                            chapter.lectureComplete &&
                            chapter.practiceComplete &&
                            chapter.pyqComplete
                          ),
                      );

                    return (
                      <div
                        key={
                          subject.subjectSlug
                        }
                        className={`rounded-xl border p-3 ${
                          COLORS[
                            subject
                              .subjectSlug
                          ]
                        }`}
                      >
                        <div className="font-bold">
                          {
                            LABELS[
                              subject
                                .subjectSlug
                            ]
                          }
                        </div>

                        <div className="mt-1 text-xs text-[#64748B]">
                          {
                            coreDone.length
                          }{" "}
                          chapters studied ·{" "}
                          {
                            started.length
                          }{" "}
                          started
                        </div>

                        <div className="mt-2 text-sm">
                          {current ? (
                            <>
                              Next/current:{" "}
                              <span className="font-semibold">
                                {
                                  current.name
                                }
                              </span>
                            </>
                          ) : (
                            <span className="font-semibold text-green-700">
                              Subject complete
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
        </div>
      )}

      {mode && (
        <button
          type="button"
          onClick={() =>
            onContinue?.(mode)
          }
          className="w-full rounded-xl bg-[#0284C7] px-4 py-3 text-sm font-bold text-white"
        >
          Continue
        </button>
      )}
    </div>
  );
}
