import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS_MAP,
  checkAchievements,
} from "@/engine/achievements";
import { createInitialState } from "@/engine/initialState";
import type { CompanyInstance } from "@/engine/types";

function company(index: number, status?: CompanyInstance["status"]): CompanyInstance {
  return {
    companyId: `legacy-company-${index}`,
    districtId: "central-command",
    licenseDate: index,
    ...(status ? { status } : {}),
  };
}

describe("commercial achievement company counts", () => {
  it("does not award operating-company milestones for quarantined-only licenses", () => {
    const state = createInitialState();
    state.companies = Array.from({ length: 50 }, (_, index) =>
      company(index, "quarantined"),
    );
    state.unlockedAchievements = [];

    expect(ACHIEVEMENTS_MAP["company-licensing"].check(state)).toBe(false);
    expect(ACHIEVEMENTS_MAP["company-50"].check(state)).toBe(false);

    const newlyUnlocked = checkAchievements(state);
    expect(newlyUnlocked).not.toContain("company-licensing");
    expect(newlyUnlocked).not.toContain("company-50");
  });

  it("keeps milestone thresholds based on operational licenses", () => {
    const state = createInitialState();
    state.companies = [
      ...Array.from({ length: 20 }, (_, index) => company(index)),
      company(20, "quarantined"),
    ];

    expect(ACHIEVEMENTS_MAP["company-licensing"].check(state)).toBe(true);
    expect(ACHIEVEMENTS_MAP["company-50"].check(state)).toBe(false);

    state.companies = Array.from({ length: 50 }, (_, index) => company(index));
    expect(ACHIEVEMENTS_MAP["company-50"].check(state)).toBe(true);
  });
});