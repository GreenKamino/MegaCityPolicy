import { describe, expect, it } from "vitest";

import { applyCoerciveBacklash } from "../coerciveBacklash";
import {
  applyDamageToEntity,
  applyMilitaryDamage,
} from "../partnerCityStats";
import {
  normalizePartnerRelationshipScores,
  refreshPartnerDynamics,
} from "../partnerDynamics";
import { createInitialState } from "../initialState";
import type { ExternalMegacity, GameState, Township } from "../types";

const SCORE_FIELDS = ["influence", "loyalty", "threat", "cityHealth", "attrition"] as const;

function stateWithPartners(): GameState {
  const state = createInitialState();
  const city: ExternalMegacity = {
    ...state.externalMegacities[0],
    id: "bounded-city",
    name: "Bounded City",
    influence: Number.POSITIVE_INFINITY,
    loyalty: Number.NaN,
    threat: -500,
    cityHealth: Number.POSITIVE_INFINITY,
    attrition: -500,
    controlStatus: "occupied",
  };
  const township: Township = {
    ...(state.townships?.[0] as Township),
    id: "bounded-township",
    name: "Bounded Township",
    influence: -500,
    loyalty: Number.POSITIVE_INFINITY,
    threat: Number.NaN,
    cityHealth: -500,
    attrition: Number.POSITIVE_INFINITY,
    controlStatus: "annexed",
  };
  return {
    ...state,
    externalMegacities: [city],
    townships: [township],
  };
}

function expectBounded(entity: ExternalMegacity | Township): void {
  for (const field of SCORE_FIELDS) {
    const value = entity[field];
    expect(Number.isFinite(value), `${field} should be finite`).toBe(true);
    expect(value, `${field} should not be negative`).toBeGreaterThanOrEqual(0);
    expect(value, `${field} should not exceed 100`).toBeLessThanOrEqual(100);
  }
}

describe("partner relationship score bounds", () => {
  it("keeps repeated diplomacy refreshes, coercion, and strikes bounded for cities and townships", () => {
    let state = stateWithPartners();
    const originalStatuses = new Map(
      [...state.externalMegacities, ...(state.townships ?? [])].map((p) => [p.id, p.controlStatus]),
    );

    for (let i = 0; i < 24; i += 1) {
      state = applyCoerciveBacklash(state, {
        actionId: "bombardment",
        actionKey: `bounded-strike:${i}`,
        targetId: i % 2 === 0 ? "bounded-city" : "bounded-township",
        scope: "targeted",
        audience: "external",
      });

      state = {
        ...state,
        externalMegacities: state.externalMegacities.map((entity) =>
          applyDamageToEntity(entity, applyMilitaryDamage(entity, "bombardment")),
        ),
        townships: (state.townships ?? []).map((entity) =>
          applyDamageToEntity(entity, applyMilitaryDamage(entity, "bombardment")),
        ),
      };

      state = {
        ...state,
        externalMegacities: state.externalMegacities.map((entity) =>
          refreshPartnerDynamics(entity, state),
        ),
        townships: (state.townships ?? []).map((entity) =>
          refreshPartnerDynamics(entity, state),
        ),
      };
    }

    for (const entity of [...state.externalMegacities, ...(state.townships ?? [])]) {
      expectBounded(entity);
      expect(entity.controlStatus).toBe(originalStatuses.get(entity.id));
    }
  });

  it("repairs non-finite scores without changing categorical partner state", () => {
    const state = stateWithPartners();
    for (const entity of [...state.externalMegacities, ...(state.townships ?? [])]) {
      const normalized = normalizePartnerRelationshipScores(entity);
      expectBounded(normalized);
      expect(normalized.controlStatus).toBe(entity.controlStatus);
      if ("status" in entity && "status" in normalized) {
        expect(normalized.status).toBe(entity.status);
      }
    }
  });
});