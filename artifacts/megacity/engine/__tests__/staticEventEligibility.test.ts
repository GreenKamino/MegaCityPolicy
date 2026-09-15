import { describe, expect, it } from "vitest";

import { BB_EVENT_POOL } from "@/engine/addons/bigBrother";
import { SD_EVENT_POOL } from "@/engine/addons/sixthDay";
import { createInitialState } from "@/engine/initialState";
import { ALL_TECHNOLOGIES } from "@/engine/technologies";
import {
  BIOSPHERE_EVENT_POOL,
  EVENT_POOL,
  EXPANSION_EVENT_POOL,
  STATIC_EVENT_PREREQUISITES,
  classifyStaticRandomEvent,
  isStaticRandomEventEligible,
} from "@/engine/events";
import type { GameState } from "@/engine/types";

const withTech = (tech: string): GameState => {
  const state = createInitialState();
  state.unlockedTechnologies = [tech];
  return state;
};

describe("static random-event eligibility", () => {
  it.each([
    ["clone workforce", ["clone_rights_petition", "clone_existential_crisis"], "mil_clone_army_program"],
    ["genetics", ["gene_wright_outbreak", "illegal_gene_clinic"], "genetic_disease_screening"],
    ["cybernetics", ["cyber_plague_outbreak"], "basic_cybernetics"],
    ["mutant interaction", ["mutant_uprising", "mutant_quarter_plague"], "xenofauna_domestication"],
  ])("blocks %s events before their prerequisite and permits them after", (_family, ids, tech) => {
    const before = createInitialState();
    before.unlockedTechnologies = [];
    for (const id of ids) {
      expect(isStaticRandomEventEligible(before, id), id).toBe(false);
      expect(classifyStaticRandomEvent(id)).toBe("prerequisite-sensitive");
      expect(isStaticRandomEventEligible(withTech(tech), id), id).toBe(true);
    }
  });

  it("only recognizes Sixth Day genetics and cloning unlocks while that addon is active", () => {
    const state = withTech("sd_human_cloning_research");
    state.addons = { ...state.addons, "sixth-day": false };
    expect(isStaticRandomEventEligible(state, "clone_rights_petition")).toBe(false);
    expect(isStaticRandomEventEligible(state, "illegal_gene_clinic")).toBe(false);

    state.addons = { ...state.addons, "sixth-day": true };
    expect(isStaticRandomEventEligible(state, "clone_rights_petition")).toBe(true);
    expect(isStaticRandomEventEligible(state, "illegal_gene_clinic")).toBe(true);
  });

  it("gates every Sixth Day story on genetics and clone stories on cloning", () => {
    const noCapability = createInitialState();
    noCapability.addons = { ...noCapability.addons, "sixth-day": true };
    for (const event of SD_EVENT_POOL) {
      expect(classifyStaticRandomEvent(event.id), event.id).toBe("prerequisite-sensitive");
      expect(isStaticRandomEventEligible(noCapability, event.id), event.id).toBe(false);
    }

    const geneticsOnly = withTech("sd_crispr_fundamentals");
    geneticsOnly.addons = { ...geneticsOnly.addons, "sixth-day": true };
    for (const event of SD_EVENT_POOL) {
      expect(isStaticRandomEventEligible(geneticsOnly, event.id), event.id).toBe(!event.id.includes("clone"));
    }

    const cloning = withTech("sd_human_cloning_research");
    cloning.addons = { ...cloning.addons, "sixth-day": true };
    for (const event of SD_EVENT_POOL) {
      expect(isStaticRandomEventEligible(cloning, event.id), event.id).toBe(true);
    }
  });

  it("makes intentional ambient content explicit instead of deriving gates from prose", () => {
    for (const id of ["abandoned_bunker_opened", "rogue_ai_sighting", "karaoke_emergency"]) {
      expect(classifyStaticRandomEvent(id)).toBe("intentionally-ambient");
      expect(isStaticRandomEventEligible(createInitialState(), id)).toBe(true);
    }
  });

  it("references real technology and static-event ids in every declared gate", () => {
    const knownEvents = new Set([
      ...EVENT_POOL,
      ...EXPANSION_EVENT_POOL,
      ...BIOSPHERE_EVENT_POOL,
      ...BB_EVENT_POOL,
      ...SD_EVENT_POOL,
    ].map((event) => event.id));
    const knownTechs = new Set(ALL_TECHNOLOGIES.map((tech) => tech.id));

    for (const id of Object.keys(STATIC_EVENT_PREREQUISITES)) {
      expect(knownEvents.has(id), `Unknown prerequisite-bound event: ${id}`).toBe(true);
    }
    for (const tech of [
      "mil_clone_army_program",
      "genetic_disease_screening",
      "basic_cybernetics",
      "xenofauna_domestication",
      "sd_human_cloning_research",
    ]) {
      expect(knownTechs.has(tech), `Unknown prerequisite technology: ${tech}`).toBe(true);
    }
  });
});