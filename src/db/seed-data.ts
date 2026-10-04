// Default JEE Main syllabus seed data.
// This is NOT hard-coded into the app logic — it lives in the database and can be
// updated/versioned (see syllabus_versions table) without changing application code.

export type SeedChapter = {
  name: string;
  weightage: number; // 1 (low) - 5 (high) relative importance used by priority engine
  bucket: number; // 1 = foundation/easy scoring, 2 = high weightage, 3 = moderate/lower priority
  lectureMinutes: number; // default original lecture duration in minutes
  size: "small" | "medium" | "large"; // drives default PYQ time
  prereqs?: string[]; // names of prerequisite chapters within the same subject
};

export const PHYSICS_CHAPTERS: SeedChapter[] = [
  { name: "Units & Measurements", weightage: 4, bucket: 1, lectureMinutes: 180, size: "small" },
  { name: "Kinematics", weightage: 3, bucket: 1, lectureMinutes: 420, size: "large" },
  { name: "Laws of Motion", weightage: 2, bucket: 3, lectureMinutes: 360, size: "medium", prereqs: ["Kinematics"] },
  { name: "Work, Energy & Power", weightage: 2, bucket: 1, lectureMinutes: 300, size: "medium", prereqs: ["Laws of Motion"] },
  { name: "Rotational Motion", weightage: 4, bucket: 2, lectureMinutes: 480, size: "large", prereqs: ["Laws of Motion", "Work, Energy & Power"] },
  { name: "Gravitation", weightage: 2, bucket: 1, lectureMinutes: 240, size: "small", prereqs: ["Kinematics"] },
  { name: "Mechanical Properties of Solids", weightage: 2, bucket: 3, lectureMinutes: 150, size: "small" },
  { name: "Mechanical Properties of Fluids", weightage: 3, bucket: 3, lectureMinutes: 180, size: "small" },
  { name: "Thermal Properties of Matter", weightage: 2, bucket: 3, lectureMinutes: 180, size: "small" },
  { name: "Thermodynamics (Physics)", weightage: 3, bucket: 2, lectureMinutes: 240, size: "medium" },
  { name: "Kinetic Theory of Gases", weightage: 2, bucket: 1, lectureMinutes: 150, size: "small" },
  { name: "Oscillations", weightage: 2, bucket: 3, lectureMinutes: 240, size: "medium" },
  { name: "Waves", weightage: 3, bucket: 3, lectureMinutes: 270, size: "medium", prereqs: ["Oscillations"] },
  { name: "Electrostatics", weightage: 5, bucket: 2, lectureMinutes: 480, size: "large" },
  { name: "Current Electricity", weightage: 4, bucket: 2, lectureMinutes: 420, size: "large", prereqs: ["Electrostatics"] },
  { name: "Magnetic Effects of Current", weightage: 3, bucket: 2, lectureMinutes: 360, size: "medium", prereqs: ["Current Electricity"] },
  { name: "Magnetism & Matter", weightage: 2, bucket: 3, lectureMinutes: 180, size: "small", prereqs: ["Magnetic Effects of Current"] },
  { name: "Electromagnetic Induction (EMI)", weightage: 2, bucket: 3, lectureMinutes: 300, size: "medium", prereqs: ["Magnetic Effects of Current"] },
  { name: "Alternating Current (AC)", weightage: 2, bucket: 3, lectureMinutes: 240, size: "medium", prereqs: ["Electromagnetic Induction (EMI)"] },
  { name: "EM Waves", weightage: 2, bucket: 1, lectureMinutes: 90, size: "small" },
  { name: "Ray Optics", weightage: 4, bucket: 2, lectureMinutes: 330, size: "medium" },
  { name: "Wave Optics", weightage: 3, bucket: 1, lectureMinutes: 180, size: "small" },
  { name: "Dual Nature of Matter & Radiation", weightage: 5, bucket: 1, lectureMinutes: 150, size: "small" },
  { name: "Atoms", weightage: 5, bucket: 1, lectureMinutes: 120, size: "small" },
  { name: "Nuclei", weightage: 5, bucket: 1, lectureMinutes: 120, size: "small" },
  { name: "Semiconductors", weightage: 3, bucket: 1, lectureMinutes: 210, size: "medium" },
];

export const CHEMISTRY_CHAPTERS: SeedChapter[] = [
  { name: "Some Basic Concepts of Chemistry", weightage: 3, bucket: 1, lectureMinutes: 240, size: "medium" },
  { name: "Atomic Structure", weightage: 3, bucket: 1, lectureMinutes: 210, size: "medium", prereqs: ["Some Basic Concepts of Chemistry"] },
  { name: "Periodicity", weightage: 3, bucket: 1, lectureMinutes: 180, size: "small", prereqs: ["Atomic Structure"] },
  { name: "Chemical Bonding", weightage: 4, bucket: 1, lectureMinutes: 360, size: "large", prereqs: ["Periodicity"] },
  { name: "States of Matter", weightage: 2, bucket: 3, lectureMinutes: 150, size: "small" },
  { name: "Thermodynamics (Chemistry)", weightage: 3, bucket: 2, lectureMinutes: 270, size: "medium" },
  { name: "Equilibrium", weightage: 4, bucket: 3, lectureMinutes: 330, size: "large" },
  { name: "Redox Reactions", weightage: 1, bucket: 3, lectureMinutes: 120, size: "small" },
  { name: "Solutions", weightage: 3, bucket: 1, lectureMinutes: 210, size: "medium" },
  { name: "Electrochemistry", weightage: 3, bucket: 2, lectureMinutes: 210, size: "medium", prereqs: ["Redox Reactions"] },
  { name: "Chemical Kinetics", weightage: 3, bucket: 1, lectureMinutes: 210, size: "medium" },
  { name: "Surface Chemistry", weightage: 1, bucket: 3, lectureMinutes: 90, size: "small" },
  { name: "Solid State", weightage: 2, bucket: 3, lectureMinutes: 150, size: "small" },
  { name: "s-Block Elements", weightage: 2, bucket: 3, lectureMinutes: 150, size: "small" },
  { name: "p-Block Elements", weightage: 1, bucket: 3, lectureMinutes: 300, size: "large" },
  { name: "d & f Block Elements", weightage: 4, bucket: 2, lectureMinutes: 180, size: "small" },
  { name: "Coordination Compounds", weightage: 4, bucket: 2, lectureMinutes: 270, size: "medium" },
  { name: "GOC (General Organic Chemistry)", weightage: 5, bucket: 1, lectureMinutes: 360, size: "large", prereqs: ["Chemical Bonding"] },
  { name: "Isomerism", weightage: 5, bucket: 1, lectureMinutes: 180, size: "medium", prereqs: ["GOC (General Organic Chemistry)"] },
  { name: "Hydrocarbons", weightage: 4, bucket: 1, lectureMinutes: 300, size: "large", prereqs: ["GOC (General Organic Chemistry)"] },
  { name: "Haloalkanes & Haloarenes", weightage: 3, bucket: 2, lectureMinutes: 210, size: "medium", prereqs: ["GOC (General Organic Chemistry)"] },
  { name: "Alcohols, Phenols & Ethers", weightage: 3, bucket: 3, lectureMinutes: 240, size: "medium", prereqs: ["Haloalkanes & Haloarenes"] },
  { name: "Aldehydes & Ketones", weightage: 3, bucket: 2, lectureMinutes: 210, size: "medium", prereqs: ["Alcohols, Phenols & Ethers"] },
  { name: "Carboxylic Acids", weightage: 1, bucket: 3, lectureMinutes: 90, size: "small", prereqs: ["Aldehydes & Ketones"] },
  { name: "Amines", weightage: 3, bucket: 2, lectureMinutes: 180, size: "medium", prereqs: ["Aldehydes & Ketones"] },
  { name: "Biomolecules", weightage: 3, bucket: 1, lectureMinutes: 150, size: "small" },
  { name: "Practical Organic Chemistry", weightage: 3, bucket: 2, lectureMinutes: 120, size: "small", prereqs: ["Aldehydes & Ketones"] },
  { name: "Practical & Environmental Chemistry", weightage: 2, bucket: 3, lectureMinutes: 90, size: "small" },
];

export const MATHS_CHAPTERS: SeedChapter[] = [
  { name: "Sets, Relations & Functions", weightage: 5, bucket: 1, lectureMinutes: 210, size: "medium" },
  { name: "Complex Numbers", weightage: 3, bucket: 2, lectureMinutes: 210, size: "medium" },
  { name: "Quadratic Equations", weightage: 3, bucket: 1, lectureMinutes: 180, size: "small" },
  { name: "Matrices", weightage: 4, bucket: 2, lectureMinutes: 210, size: "medium" },
  { name: "Determinants", weightage: 4, bucket: 2, lectureMinutes: 180, size: "small", prereqs: ["Matrices"] },
  { name: "Permutations & Combinations (P&C)", weightage: 3, bucket: 1, lectureMinutes: 240, size: "medium" },
  { name: "Binomial Theorem", weightage: 3, bucket: 1, lectureMinutes: 150, size: "small" },
  { name: "Sequences & Series", weightage: 4, bucket: 1, lectureMinutes: 210, size: "medium" },
  { name: "Limits, Continuity & Differentiability", weightage: 3, bucket: 3, lectureMinutes: 330, size: "large", prereqs: ["Sets, Relations & Functions"] },
  { name: "Differentiation", weightage: 3, bucket: 3, lectureMinutes: 210, size: "medium", prereqs: ["Limits, Continuity & Differentiability"] },
  { name: "Application of Derivatives", weightage: 2, bucket: 2, lectureMinutes: 300, size: "large", prereqs: ["Limits, Continuity & Differentiability"] },
  { name: "Indefinite Integration", weightage: 1, bucket: 3, lectureMinutes: 330, size: "large", prereqs: ["Differentiation"] },
  { name: "Definite Integration", weightage: 4, bucket: 2, lectureMinutes: 270, size: "medium", prereqs: ["Indefinite Integration"] },
  { name: "Area Under Curves", weightage: 3, bucket: 2, lectureMinutes: 150, size: "small", prereqs: ["Indefinite Integration"] },
  { name: "Differential Equations", weightage: 4, bucket: 2, lectureMinutes: 210, size: "medium", prereqs: ["Definite Integration"] },
  { name: "Straight Lines", weightage: 4, bucket: 1, lectureMinutes: 210, size: "medium" },
  { name: "Circle", weightage: 4, bucket: 1, lectureMinutes: 210, size: "medium", prereqs: ["Straight Lines"] },
  { name: "Parabola", weightage: 1, bucket: 3, lectureMinutes: 180, size: "medium", prereqs: ["Straight Lines"] },
  { name: "Ellipse", weightage: 2, bucket: 3, lectureMinutes: 180, size: "medium", prereqs: ["Straight Lines"] },
  { name: "Hyperbola", weightage: 2, bucket: 3, lectureMinutes: 150, size: "small", prereqs: ["Straight Lines"] },
  { name: "3D Geometry", weightage: 5, bucket: 2, lectureMinutes: 210, size: "medium" },
  { name: "Vectors", weightage: 5, bucket: 2, lectureMinutes: 180, size: "medium" },
  { name: "Statistics", weightage: 2, bucket: 2, lectureMinutes: 120, size: "small" },
  { name: "Probability", weightage: 3, bucket: 1, lectureMinutes: 240, size: "medium", prereqs: ["Permutations & Combinations (P&C)"] },
  { name: "Trigonometric Ratios & Identities", weightage: 3, bucket: 3, lectureMinutes: 210, size: "medium" },
  { name: "Inverse Trigonometric Functions", weightage: 1, bucket: 3, lectureMinutes: 120, size: "small", prereqs: ["Trigonometric Ratios & Identities"] },
  { name: "Mathematical Reasoning", weightage: 1, bucket: 3, lectureMinutes: 60, size: "small" },
];
