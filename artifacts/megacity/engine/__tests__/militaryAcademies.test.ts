import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import {
  ACADEMY_COURSES,
  MILITARY_ACADEMIES,
  academyPrerequisitesMet,
  createAcademyCourseOrder,
  getAcademyTrainingReduction,
  validateAcademyCourse,
} from "@/engine/militaryAcademies";
import { processPendingConstructions } from "@/engine/pendingConstruction";
import { migrateState } from "@/engine/saveLoad";

function academyState() {
  const state = createInitialState();
  state.militaryOverhaul = createDefaultMilitaryState();
  state.resources.credits = 100_000;
  state.resources.steel = 1000;
  state.resources.food = 1000;
  state.resources.fuel = 1000;
  state.resources.ammo = 1000;
  state.resources.medSupplies = 1000;
  state.unlockedTechnologies = ["mil_military_academies", "mil_urban_warfare_doctrine"];
  state.militaryOverhaul.logistics.installationsBuilt = {
    infantry_training_grounds: 1,
    combined_arms_academy: 1,
  };
  state.militaryOverhaul.academies.facilities.combined_arms_academy = {
    quality: 78,
    instructors: [state.officers[0].id],
  };
  return state;
}

describe("military academies", () => {
  it("ships five distinct academy roles with separate course outputs", () => {
    expect(MILITARY_ACADEMIES).toHaveLength(5);
    expect(new Set(MILITARY_ACADEMIES.map((academy) => academy.role)).size).toBe(5);
    expect(new Set(ACADEMY_COURSES.map((course) => course.qualificationId)).size).toBe(5);
  });

  it("requires research and a prerequisite facility before construction/training", () => {
    const state = academyState();
    const academy = MILITARY_ACADEMIES[0];
    expect(academyPrerequisitesMet(state, academy)).toBe(true);
    state.unlockedTechnologies = [];
    expect(academyPrerequisitesMet(state, academy)).toBe(false);
    expect(validateAcademyCourse(state, "combined_arms_command")).toContain("prerequisites");
  });

  it("charges course resources into the shared timed queue", () => {
    const state = academyState();
    const beforeCredits = state.resources.credits;
    const beforeFood = state.resources.food;
    const order = createAcademyCourseOrder(state, "combined_arms_command");
    expect(order?.kind).toBe("academy");
    expect(order?.ticksTotal).toBe(10);
    expect(validateAcademyCourse(state, "combined_arms_command")).toBeNull();
    expect(beforeCredits - ACADEMY_COURSES[0].credits).toBe(91_000);
    expect(beforeFood - (ACADEMY_COURSES[0].supplies.food ?? 0)).toBe(970);
  });

  it("records a qualification on completion and speeds matching recruit training", () => {
    const state = academyState();
    const order = createAcademyCourseOrder(state, "combined_arms_command")!;
    order.ticksRemaining = 1;
    state.pendingConstructions = [order];
    const entries: any[] = [];
    processPendingConstructions(state, entries, () => {});
    expect(state.militaryOverhaul?.academies.qualifications.combined_arms_command).toBe(1);
    expect(getAcademyTrainingReduction(state, "Military")).toBe(0.05);
    expect(entries.some((entry) => entry.label === "Academy Graduation")).toBe(true);
  });

  it("migrates academy state without dropping old military saves", () => {
    const state = academyState();
    const loaded = migrateState(state);
    expect(loaded.militaryOverhaul?.academies?.facilities.combined_arms_academy).toBeTruthy();
    expect(loaded.militaryOverhaul?.academies?.qualifications).toEqual({});
  });
});