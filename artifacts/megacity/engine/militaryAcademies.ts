import type { GameState, OfficerRank, PendingConstruction, TickEntry } from "@/engine/types";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";

export type AcademyRole = "military" | "security" | "intelligence" | "emergency" | "specialist";

export type AcademyCourseDef = {
  id: string;
  academyId: string;
  name: string;
  qualificationId: string;
  role: string;
  ticks: number;
  credits: number;
  steel: number;
  supplies: Partial<Record<"food" | "fuel" | "medSupplies" | "ammo", number>>;
  capacity: number;
  readinessBonus: number;
};

export type MilitaryAcademyDef = {
  id: string;
  name: string;
  role: AcademyRole;
  capacity: number;
  instructorRank: OfficerRank;
  quality: number;
  prerequisiteTechnologies: string[];
  prerequisiteBuildings: string[];
  courseIds: string[];
};

export type AcademyFacilityState = {
  quality: number;
  instructors: string[];
};

export type MilitaryAcademyState = {
  facilities: Record<string, AcademyFacilityState>;
  qualifications: Record<string, number>;
  completedCourses: number;
  graduationRate: number;
  readinessBonus: number;
};

export const MILITARY_ACADEMIES: MilitaryAcademyDef[] = [
  {
    id: "combined_arms_academy",
    name: "Combined Arms Academy",
    role: "military",
    capacity: 24,
    instructorRank: "senior_officer",
    quality: 78,
    prerequisiteTechnologies: ["mil_military_academies", "mil_urban_warfare_doctrine"],
    prerequisiteBuildings: ["infantry_training_grounds"],
    courseIds: ["combined_arms_command"],
  },
  {
    id: "security_command_academy",
    name: "Security Command Academy",
    role: "security",
    capacity: 20,
    instructorRank: "officer",
    quality: 74,
    prerequisiteTechnologies: ["mil_military_academies", "mil_military_communications"],
    prerequisiteBuildings: ["tactical_response_base"],
    courseIds: ["security_operations"],
  },
  {
    id: "intelligence_analysis_academy",
    name: "Intelligence Analysis Academy",
    role: "intelligence",
    capacity: 16,
    instructorRank: "director",
    quality: 82,
    prerequisiteTechnologies: ["mil_military_academies", "mil_military_communications"],
    prerequisiteBuildings: ["intelligence_directorate"],
    courseIds: ["intelligence_analysis"],
  },
  {
    id: "emergency_response_academy",
    name: "Emergency Response Academy",
    role: "emergency",
    capacity: 18,
    instructorRank: "officer",
    quality: 76,
    prerequisiteTechnologies: ["mil_military_academies", "mil_field_hospitals"],
    prerequisiteBuildings: ["military_supply_depot"],
    courseIds: ["emergency_response"],
  },
  {
    id: "specialist_operations_academy",
    name: "Specialist Operations Academy",
    role: "specialist",
    capacity: 10,
    instructorRank: "director",
    quality: 88,
    prerequisiteTechnologies: ["mil_military_academies", "mil_special_forces_training"],
    prerequisiteBuildings: ["special_forces_compound"],
    courseIds: ["specialist_operations"],
  },
];

export const ACADEMY_COURSES: AcademyCourseDef[] = [
  { id: "combined_arms_command", academyId: "combined_arms_academy", name: "Combined Arms Command", qualificationId: "combined_arms_command", role: "command", ticks: 10, credits: 9000, steel: 8, supplies: { food: 30, fuel: 12, ammo: 10 }, capacity: 4, readinessBonus: 1.2 },
  { id: "security_operations", academyId: "security_command_academy", name: "Security Operations", qualificationId: "security_operations", role: "security", ticks: 8, credits: 7000, steel: 5, supplies: { food: 24, fuel: 8, ammo: 5 }, capacity: 4, readinessBonus: 0.8 },
  { id: "intelligence_analysis", academyId: "intelligence_analysis_academy", name: "Intelligence Analysis", qualificationId: "intelligence_analysis", role: "intelligence", ticks: 9, credits: 8000, steel: 4, supplies: { food: 20, medSupplies: 2 }, capacity: 3, readinessBonus: 0.7 },
  { id: "emergency_response", academyId: "emergency_response_academy", name: "Emergency Response", qualificationId: "emergency_response", role: "emergency", ticks: 7, credits: 6000, steel: 4, supplies: { food: 20, medSupplies: 8, fuel: 5 }, capacity: 4, readinessBonus: 0.6 },
  { id: "specialist_operations", academyId: "specialist_operations_academy", name: "Specialist Operations", qualificationId: "specialist_operations", role: "specialist", ticks: 14, credits: 14000, steel: 10, supplies: { food: 40, fuel: 15, ammo: 20, medSupplies: 4 }, capacity: 2, readinessBonus: 2 },
];

const ACADEMY_BY_ID = new Map(MILITARY_ACADEMIES.map((academy) => [academy.id, academy]));
const COURSE_BY_ID = new Map(ACADEMY_COURSES.map((course) => [course.id, course]));
const RANK_ORDER: OfficerRank[] = ["cadet", "officer", "senior_officer", "director", "commissioner", "chief_director"];

export function getAcademy(id: string): MilitaryAcademyDef | undefined {
  return ACADEMY_BY_ID.get(id);
}

export function getAcademyCourse(id: string): AcademyCourseDef | undefined {
  return COURSE_BY_ID.get(id);
}

export function getAcademyForBuilding(id: string): MilitaryAcademyDef | undefined {
  return ACADEMY_BY_ID.get(id);
}

export function createDefaultAcademyState(): MilitaryAcademyState {
  return { facilities: {}, qualifications: {}, completedCourses: 0, graduationRate: 0, readinessBonus: 0 };
}

export function academyPrerequisitesMet(state: GameState, academy: MilitaryAcademyDef): boolean {
  const built = state.militaryOverhaul?.logistics?.installationsBuilt ?? {};
  return academy.prerequisiteTechnologies.every((id) => (state.unlockedTechnologies ?? []).includes(id))
    && academy.prerequisiteBuildings.every((id) => (built[id] ?? 0) > 0);
}

export function getEligibleAcademyInstructorCount(state: GameState, academy: MilitaryAcademyDef): number {
  const required = RANK_ORDER.indexOf(academy.instructorRank);
  return (state.officers ?? []).filter((officer) => RANK_ORDER.indexOf(officer.rank) >= required && !officer.exitReason).length;
}

export function getAcademyCapacity(state: GameState, academyId: string): number {
  const academy = getAcademy(academyId);
  const built = state.militaryOverhaul?.logistics?.installationsBuilt?.[academyId] ?? 0;
  return academy ? Math.max(0, Math.floor(built)) * academy.capacity : 0;
}

export function getAcademyQuality(state: GameState, academyId: string): number {
  const academy = getAcademy(academyId);
  if (!academy) return 0;
  const facility = state.militaryOverhaul?.academies?.facilities?.[academyId];
  const instructors = facility?.instructors.length ?? 0;
  const eligible = getEligibleAcademyInstructorCount(state, academy);
  const instructorFactor = eligible > 0 ? Math.min(1, instructors / Math.max(1, Math.min(eligible, Math.floor((state.militaryOverhaul?.logistics?.installationsBuilt?.[academyId] ?? 0)))) ) : 0;
  return Math.round(academy.quality * (0.65 + instructorFactor * 0.35));
}

export function getAcademyGraduationRate(state: GameState, academyId: string): number {
  const quality = getAcademyQuality(state, academyId);
  return Math.max(0, Math.min(100, Math.round(quality * 0.8)));
}

export function getAcademyTrainingReduction(state?: GameState, unitCategory?: string): number {
  if (!state) return 0;
  const qualifications = state.militaryOverhaul?.academies?.qualifications ?? {};
  const matches: Record<string, string[]> = {
    "Military": ["combined_arms_command"],
    "Vehicles": ["combined_arms_command"],
    "Air Units": ["combined_arms_command"],
    "Law Enforcement": ["security_operations"],
    "Riot Control": ["security_operations"],
    "Intelligence": ["intelligence_analysis"],
    "Medical & Disaster": ["emergency_response"],
    "Special Operations": ["specialist_operations"],
  };
  const rates: Record<string, number> = {
    combined_arms_command: 0.05,
    security_operations: 0.05,
    intelligence_analysis: 0.08,
    emergency_response: 0.06,
    specialist_operations: 0.1,
  };
  return Math.min(
    0.2,
    (matches[unitCategory ?? ""] ?? []).reduce(
      (sum, qualificationId) => sum + (qualifications[qualificationId] ?? 0) * (rates[qualificationId] ?? 0),
      0,
    ),
  );
}

export function validateAcademyCourse(state: GameState, courseId: string): string | null {
  const course = getAcademyCourse(courseId);
  if (!course) return "Course unavailable.";
  const academy = getAcademy(course.academyId);
  if (!academy || !academyPrerequisitesMet(state, academy)) return "Academy prerequisites are not met.";
  const capacity = getAcademyCapacity(state, academy.id);
  const active = (state.pendingConstructions ?? []).filter((order) => order.kind === "academy" && order.academyId === academy.id)
    .reduce((sum, order) => sum + order.count, 0);
  if (active + course.capacity > capacity) return `Capacity exceeded: ${capacity} trainee slots available.`;
  if (state.resources.credits < course.credits) return "Insufficient credits.";
  if (state.resources.steel < course.steel) return "Insufficient steel.";
  for (const [key, amount] of Object.entries(course.supplies)) {
    if ((state.resources[key as keyof typeof state.resources] ?? 0) < (amount ?? 0)) return `Insufficient ${key}.`;
  }
  if (getEligibleAcademyInstructorCount(state, academy) < 1) return "An eligible instructor is required.";
  return null;
}

export function createAcademyCourseOrder(state: GameState, courseId: string): PendingConstruction | null {
  const course = getAcademyCourse(courseId);
  if (!course || validateAcademyCourse(state, courseId)) return null;
  return {
    id: `academy-${state.totalTicks}-${course.id}-${Math.floor(Math.random() * 1e6)}`,
    kind: "academy",
    buildingKey: course.qualificationId,
    label: course.name,
    count: 1,
    ticksTotal: course.ticks,
    ticksRemaining: course.ticks,
    orderedTick: state.totalTicks,
    academyId: course.academyId,
    courseId: course.id,
  };
}

export function completeAcademyCourse(state: GameState, order: PendingConstruction, entries: TickEntry[]): void {
  const course = order.courseId ? getAcademyCourse(order.courseId) : undefined;
  if (!course) return;
  const mil = state.militaryOverhaul;
  if (!mil) return;
  const academy = getAcademy(course.academyId);
  const quality = getAcademyQuality(state, course.academyId);
  const rate = getAcademyGraduationRate(state, course.academyId);
  mil.academies = {
    ...(mil.academies ?? createDefaultAcademyState()),
    qualifications: { ...(mil.academies?.qualifications ?? {}), [course.qualificationId]: (mil.academies?.qualifications?.[course.qualificationId] ?? 0) + 1 },
    completedCourses: (mil.academies?.completedCourses ?? 0) + 1,
    graduationRate: Math.round(((mil.academies?.graduationRate ?? 0) + rate) / 2),
    readinessBonus: (mil.academies?.readinessBonus ?? 0) + course.readinessBonus * (quality / 100),
  };
  entries.push({ label: "Academy Graduation", delta: 1, unit: "qualification", reason: `${academy?.name ?? "Academy"} graduated ${course.name} at ${rate}% projected quality.`, severity: "positive" });
}

export function academyBuildings() {
  return MILITARY_BUILDINGS.filter((building) => Boolean(building.academy));
}