export interface TimeWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface DayAvailability {
  dayOfWeek: number; // 0=Sun..6=Sat
  windows: TimeWindow[];
}

export interface FixedEventDraft {
  id: string;
  title: string;
  category: "coaching" | "school" | "gym" | "tuition" | "travel" | "sleep" | "other";
  start: string;
  end: string;
  days: number[]; // 0-6
}

export interface OnboardingState {
  name: string;
  targetExam: string;
  targetYear: number;
  targetDate: string;
  studentType: "dropper" | "class12" | "class11";
  availability: DayAvailability[];
  fixedEvents: FixedEventDraft[];
  physicsLevel: "weak" | "average" | "strong";
  chemistryLevel: "weak" | "average" | "strong";
  mathsLevel: "weak" | "average" | "strong";
  targetScore: number;
  strategy:
    | "full_syllabus"
    | "bucket_strategy"
    | "high_weightage_first"
    | "backlog_completion"
    | "revision_focus"
    | "custom_chapters";
  selectedBuckets: number[];
  planDurationDays: number;
  customDeadline: string;
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_STATE_SEED = (name: string): OnboardingState => ({
  name,
  targetExam: "JEE Main",
  targetYear: new Date().getFullYear() + 1,
  targetDate: "",
  studentType: "class12",
  availability: [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    dayOfWeek: d,
    windows: d === 0 ? [{ start: "10:00", end: "14:00" }] : [{ start: "18:00", end: "21:00" }],
  })),
  fixedEvents: [],
  physicsLevel: "average",
  chemistryLevel: "average",
  mathsLevel: "average",
  targetScore: 200,
  strategy: "full_syllabus",
  selectedBuckets: [1, 2, 3],
  planDurationDays: 60,
  customDeadline: "",
});
