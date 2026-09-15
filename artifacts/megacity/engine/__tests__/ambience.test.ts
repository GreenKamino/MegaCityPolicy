import { describe, expect, it } from "vitest";
import {
  computeTensionScore,
  resolveMood,
  moodBeds,
  moodOneShots,
  MOOD_HYSTERESIS,
  type AmbienceMood,
} from "@/engine/ambience";

describe("computeTensionScore", () => {
  it("returns a low score for a calm, happy, well-ordered city", () => {
    const score = computeTensionScore({ unrest: 8, crime: 10, happiness: 85, lawOrder: 80 });
    expect(score).toBeLessThan(28);
  });

  it("returns a high score for a city in chaos", () => {
    const score = computeTensionScore({ unrest: 95, crime: 90, happiness: 10, lawOrder: 5 });
    expect(score).toBeGreaterThan(70);
  });

  it("rises with unrest and falls with law & order", () => {
    const low = computeTensionScore({ unrest: 30, crime: 30, happiness: 50, lawOrder: 90 });
    const high = computeTensionScore({ unrest: 80, crime: 30, happiness: 50, lawOrder: 10 });
    expect(high).toBeGreaterThan(low);
  });

  it("stays within 0..100 and tolerates out-of-range / NaN inputs", () => {
    expect(computeTensionScore({ unrest: 200, crime: 200, happiness: -50, lawOrder: -50 })).toBeLessThanOrEqual(100);
    expect(computeTensionScore({ unrest: -10, crime: -10, happiness: 200, lawOrder: 200 })).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(computeTensionScore({ unrest: NaN, crime: 10, happiness: 10, lawOrder: 10 }))).toBe(true);
  });
});

describe("resolveMood", () => {
  it("maps raw scores to bands when there is no previous mood", () => {
    expect(resolveMood(5, null)).toBe("calm");
    expect(resolveMood(35, null)).toBe("uneasy");
    expect(resolveMood(55, null)).toBe("tense");
    expect(resolveMood(85, null)).toBe("crisis");
  });

  it("rises responsively, jumping multiple bands at once", () => {
    expect(resolveMood(85, "calm")).toBe("crisis");
  });

  it("applies hysteresis on the way down (does not flip on a tiny dip)", () => {
    // tense band entry is 48; a dip to just below 48 must NOT drop to uneasy.
    expect(resolveMood(47, "tense")).toBe("tense");
    // only once it falls a full hysteresis margin below does it step down.
    expect(resolveMood(48 - MOOD_HYSTERESIS - 1, "tense")).toBe("uneasy");
  });

  it("does not oscillate when a stat hovers on a boundary", () => {
    let mood: AmbienceMood | null = "calm";
    const seq: AmbienceMood[] = [];
    // hover around the uneasy entry threshold (28)
    for (const score of [27, 29, 27, 29, 27, 29]) {
      mood = resolveMood(score, mood);
      seq.push(mood);
    }
    // first crossing goes up; small dips below 28 stay (28 - 7 = 21 floor)
    expect(seq).toEqual(["calm", "uneasy", "uneasy", "uneasy", "uneasy", "uneasy"]);
  });
});

describe("moodBeds", () => {
  it("provides a non-zero base hum for every mood and louder unrest as it worsens", () => {
    const calm = moodBeds("calm");
    const crisis = moodBeds("crisis");
    expect(calm.base).toBeGreaterThan(0);
    expect(calm.unrest).toBe(0);
    expect(crisis.unrest).toBeGreaterThan(moodBeds("tense").unrest);
    expect(moodBeds("tense").unrest).toBeGreaterThan(moodBeds("uneasy").unrest);
  });

  it("keeps every bed level under 1 so ambience never overpowers SFX", () => {
    for (const m of ["calm", "uneasy", "tense", "crisis"] as AmbienceMood[]) {
      const b = moodBeds(m);
      expect(b.base).toBeLessThan(1);
      expect(b.unrest).toBeLessThan(1);
    }
  });
});

describe("moodOneShots", () => {
  it("returns a valid plan with sane interval ordering for each mood", () => {
    for (const m of ["calm", "uneasy", "tense", "crisis"] as AmbienceMood[]) {
      const plan = moodOneShots(m, false);
      expect(plan).not.toBeNull();
      expect(plan!.pool.length).toBeGreaterThan(0);
      expect(plan!.maxIntervalMs).toBeGreaterThanOrEqual(plan!.minIntervalMs);
    }
  });

  it("fires more frequently as the mood worsens", () => {
    const calm = moodOneShots("calm", false)!;
    const crisis = moodOneShots("crisis", false)!;
    expect(crisis.minIntervalMs).toBeLessThan(calm.minIntervalMs);
  });

  it("suppresses startling sounds and slows cadence under reduced motion", () => {
    const crisis = moodOneShots("crisis", true);
    expect(crisis).not.toBeNull();
    expect(crisis!.pool).not.toContain("siren");
    expect(crisis!.pool).not.toContain("gunfire_distant");
    expect(crisis!.pool).not.toContain("explosion_distant");
    expect(crisis!.pool).not.toContain("unrest_high");
    const crisisNormal = moodOneShots("crisis", false)!;
    expect(crisis!.minIntervalMs).toBeGreaterThan(crisisNormal.minIntervalMs);
  });
});
