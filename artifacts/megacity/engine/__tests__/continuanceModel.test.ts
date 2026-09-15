import { describe, expect, it } from "vitest";
import {
  CONTINUANCE_ID,
  DEFAULT_CONTINUANCE_OPERATIONAL,
  getEffectiveContinuanceDiscoveryStage,
  isValidContinuanceOperational,
  isContinuanceMapInteractionLocked,
  normalizeContinuanceOperational,
  redactContinuanceOperational,
} from "@/engine/continuance";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";

describe("Continuance operational model", () => {
  it("keeps reconciled cohorts within bunker housing", () => {
    const state = normalizeContinuanceOperational({
      cohorts: { totalSurvivors: 999999, dependents: 999999, workers: 999999, administrators: 999999, activeDuty: 999999, reserves: 999999, command: 999999 },
      bunker: { housing: 10, capacity: 1 },
    });
    const cohortSum = state.cohorts.dependents + state.cohorts.workers + state.cohorts.administrators
      + state.cohorts.activeDuty + state.cohorts.reserves + state.cohorts.command;
    expect(state.cohorts.totalSurvivors).toBe(cohortSum);
    expect(cohortSum).toBeLessThanOrEqual(state.bunker.housing);
    expect(state.bunker.capacity).toBeGreaterThanOrEqual(state.bunker.housing);
    expect(isValidContinuanceOperational(state)).toBe(true);
  });

  it("bounds malformed plan data and redacts sensitive plan details", () => {
    const normalized = normalizeContinuanceOperational({
      morale: -4,
      restorationPlan: { planning: 1000, targetRegions: ["A", 7 as never, "B"] },
    });
    expect(normalized.morale).toBe(0);
    expect(normalized.restorationPlan.planning).toBe(100);
    expect(normalized.restorationPlan.targetRegions).toEqual(["A", "B"]);
    const redacted = redactContinuanceOperational(normalized);
    expect(redacted.restorationPlan.targetRegions).toEqual([]);
    expect(redacted.restorationPlan.infiltration).toBe(0);
  });

  it("derives discovery visibility without changing campaign state", () => {
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, [], 0)).toBe(0);
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, [CONTINUANCE_ID], 0)).toBe(1);
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, [], 81)).toBe(3);
    expect(DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.mobilization).toBe(22);
  });

  it("keeps the sealed facility outside generic world-map missions", () => {
    expect(isContinuanceMapInteractionLocked(CONTINUANCE_ID)).toBe(true);
    expect(isContinuanceMapInteractionLocked("irongate")).toBe(false);
  });

  it("keeps new games hidden while preserving legacy discovery on migration", () => {
    const fresh = createInitialState();
    expect(fresh.discoveredLocationIds).not.toContain(CONTINUANCE_ID);
    expect(fresh.externalMegacities.find((city) => city.id === CONTINUANCE_ID)?.isActive).toBe(false);

    const legacy = {
      ...fresh,
      discoveredLocationIds: fresh.discoveredLocationIds.filter((id) => id !== CONTINUANCE_ID),
      externalMegacities: fresh.externalMegacities.filter((city) => city.id !== CONTINUANCE_ID),
    };
    const migrated = migrateState(legacy);
    expect(migrated.discoveredLocationIds).toContain(CONTINUANCE_ID);
    expect(migrated.externalMegacities.find((city) => city.id === CONTINUANCE_ID)?.continuance).toBeDefined();
  });

  it("normalizes malformed Continuance state during save sanitization", () => {
    const fresh = createInitialState();
    const continuance = fresh.externalMegacities.find((city) => city.id === CONTINUANCE_ID)!;
    const malformed = {
      ...fresh,
      externalMegacities: fresh.externalMegacities.map((city) => city.id === CONTINUANCE_ID
        ? {
          ...continuance,
          continuance: {
            ...continuance.continuance!,
            morale: 999,
            cohorts: { ...continuance.continuance!.cohorts, workers: 999999 },
          },
        }
        : city),
    };
    const sanitized = sanitizeState(malformed);
    const normalized = sanitized.externalMegacities.find((city) => city.id === CONTINUANCE_ID)!.continuance!;
    expect(normalized.morale).toBe(100);
    expect(normalized.cohorts.totalSurvivors).toBeLessThanOrEqual(normalized.bunker.housing);
    expect(isValidContinuanceOperational(normalized)).toBe(true);
  });
});