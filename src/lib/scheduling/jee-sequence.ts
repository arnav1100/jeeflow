import type { SubjectSlug } from "./types";

type SequenceItem = {
  subject: SubjectSlug;
  order: number;
  names: string[];
};

export const JEE_SEQUENCE: SequenceItem[] = [
  // ==================== MATHEMATICS ====================
  { subject: "maths", order: 1, names: ["Sets, Relations & Functions"] },
  { subject: "maths", order: 2, names: ["Quadratic Equation", "Quadratic Equations"] },
  { subject: "maths", order: 3, names: ["Sequence & Series", "Sequences & Series"] },
  { subject: "maths", order: 4, names: ["Permutation & Combination", "Permutation and Combination"] },
  { subject: "maths", order: 5, names: ["Binomial Theorem"] },
  { subject: "maths", order: 6, names: ["Probability"] },
  { subject: "maths", order: 7, names: ["Matrices & Determinants", "Matrices and Determinants"] },
  { subject: "maths", order: 8, names: ["Vector & 3D Geometry", "Vector and 3D Geometry"] },
  { subject: "maths", order: 9, names: ["Statistics"] },
  { subject: "maths", order: 10, names: ["Complex Numbers"] },
  { subject: "maths", order: 11, names: ["Limits, C & D", "Limits Continuity & Differentiability"] },
  { subject: "maths", order: 12, names: ["Inverse Trigonometry", "Inverse Trigonometric Functions"] },
  { subject: "maths", order: 13, names: ["AOD (Application of Derivatives)", "Application of Derivatives"] },
  { subject: "maths", order: 14, names: ["Indefinite Integration"] },
  { subject: "maths", order: 15, names: ["Definite Integration"] },
  { subject: "maths", order: 16, names: ["Differential Equation", "Differential Equations"] },
  { subject: "maths", order: 17, names: ["Area Under Curves (AUC)", "Area Under Curves"] },
  { subject: "maths", order: 18, names: ["Straight Line & Circle", "Straight Line and Circle"] },
  { subject: "maths", order: 19, names: ["Parabola"] },
  { subject: "maths", order: 20, names: ["Ellipse"] },
  { subject: "maths", order: 21, names: ["Hyperbola"] },

  // ==================== PHYSICS ====================
  { subject: "physics", order: 1, names: ["Units, Dimension & Measurement", "Units Dimensions and Measurements"] },
  { subject: "physics", order: 2, names: ["Motion in 1D & 2D", "Motion in 1D and 2D"] },
  { subject: "physics", order: 3, names: ["NLM Basics"] },
  { subject: "physics", order: 4, names: ["Work, Energy & Power (WEP)", "Work Energy and Power"] },
  { subject: "physics", order: 5, names: ["Gravitation"] },
  { subject: "physics", order: 6, names: ["KTG (Kinetic Theory of Gases)", "Kinetic Theory of Gases", "KTG"] },
  { subject: "physics", order: 7, names: ["Modern Physics"] },
  { subject: "physics", order: 8, names: ["Semiconductors", "Semiconductor"] },
  { subject: "physics", order: 9, names: ["EM Waves", "Electromagnetic Waves"] },
  { subject: "physics", order: 10, names: ["Wave Optics"] },
  { subject: "physics", order: 11, names: ["Ray Optics"] },
  { subject: "physics", order: 12, names: ["Electrostatics & Capacitance", "Electrostatics and Capacitance"] },
  { subject: "physics", order: 13, names: ["Current Electricity"] },
  { subject: "physics", order: 14, names: ["Magnetic Effect of Current", "Magnetic Effects of Current"] },
  { subject: "physics", order: 15, names: ["EMI (Electromagnetic Induction)", "Electromagnetic Induction", "EMI"] },
  { subject: "physics", order: 16, names: ["AC (Alternating Current)", "Alternating Current", "AC"] },
  { subject: "physics", order: 17, names: ["Thermodynamics"] },
  { subject: "physics", order: 18, names: ["NLM (Full Chapter)", "NLM"] },
  { subject: "physics", order: 19, names: ["SHM & Oscillations", "SHM and Oscillations"] },
  { subject: "physics", order: 20, names: ["Fluid Mechanics"] },
  { subject: "physics", order: 21, names: ["Rotational Motion"] },

  // ==================== CHEMISTRY ====================
  { subject: "chemistry", order: 1, names: ["Some Basic Concepts of Chemistry (Mole)", "Mole Concept"] },
  { subject: "chemistry", order: 2, names: ["Structure of Atom", "Atomic Structure"] },
  { subject: "chemistry", order: 3, names: ["Periodic Properties"] },
  { subject: "chemistry", order: 4, names: ["Chemical Bonding"] },
  { subject: "chemistry", order: 5, names: ["Coordination Compounds"] },
  { subject: "chemistry", order: 6, names: ["d & f Block", "d and f Block"] },
  { subject: "chemistry", order: 7, names: ["P Block", "p Block"] },
  { subject: "chemistry", order: 8, names: ["GOC + Isomerism", "GOC and Isomerism"] },
  { subject: "chemistry", order: 9, names: ["Hydrocarbons"] },
  { subject: "chemistry", order: 10, names: ["Haloalkanes & Arenes", "Haloalkanes and Arenes"] },
  { subject: "chemistry", order: 11, names: ["Aldehyde & Ketones", "Aldehydes and Ketones"] },
  { subject: "chemistry", order: 12, names: ["Carboxylic Acid", "Carboxylic Acids"] },
  { subject: "chemistry", order: 13, names: ["Amines"] },
  { subject: "chemistry", order: 14, names: ["Practical Organic Chemistry"] },
  { subject: "chemistry", order: 15, names: ["Biomolecules"] },
  { subject: "chemistry", order: 16, names: ["Redox Reactions", "Redox Reaction"] },
  { subject: "chemistry", order: 17, names: ["Chemical & Ionic Equilibrium", "Chemical and Ionic Equilibrium"] },
  { subject: "chemistry", order: 18, names: ["Thermodynamics"] },
  { subject: "chemistry", order: 19, names: ["Electrochemistry"] },
  { subject: "chemistry", order: 20, names: ["Solutions"] },
  { subject: "chemistry", order: 21, names: ["Chemical Kinetics"] },
  { subject: "chemistry", order: 22, names: ["Practical Chemistry"] },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sequenceMap = new Map<string, number>();

for (const item of JEE_SEQUENCE) {
  for (const name of item.names) {
    sequenceMap.set(`${item.subject}:${normalize(name)}`, item.order);
  }
}

export function getJeeSequenceOrder(
  subject: SubjectSlug,
  chapterName: string,
): number | null {
  return sequenceMap.get(`${subject}:${normalize(chapterName)}`) ?? null;
}
