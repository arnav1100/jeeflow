// Pure helper that converts a lecture's "original video duration" at a chosen
// playback speed, plus a note-taking overhead percentage, into a realistic
// number of minutes the student should actually plan to spend.
//
// Example from spec:
//   10 hour original lecture at 2x -> 5 hours of viewing
//   + 20% note-taking overhead -> ~6 planned hours

export interface LectureTimeInput {
  durationType: "original" | "actual_watch";
  originalMinutes: number; // minutes entered by the student
  playbackSpeed: number; // only relevant when durationType === "original"
  noteOverheadPercent: number; // 0-100
}

export function calculatePlannedLectureMinutes(input: LectureTimeInput): number {
  const { durationType, originalMinutes, playbackSpeed, noteOverheadPercent } = input;

  const baseMinutes =
    durationType === "original" && playbackSpeed > 0
      ? originalMinutes / playbackSpeed
      : originalMinutes;

  const withOverhead = baseMinutes * (1 + noteOverheadPercent / 100);

  return Math.max(0, Math.round(withOverhead));
}

export function formatMinutesAsHm(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function defaultPyqMinutes(size: "small" | "medium" | "large"): number {
  if (size === "small") return 50;
  if (size === "large") return 135;
  return 90;
}
