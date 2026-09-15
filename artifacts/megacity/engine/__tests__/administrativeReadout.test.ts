import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";
import {
  ADMINISTRATIVE_COHORT_LABELS,
  formatAdministrativeEffectLabel,
  getAdministrativeReadout,
} from "@/engine/administrativeReadout";
import { makeAdministrativeDemandEvent } from "@/engine/factionDemands";
import { createInitialState } from "@/engine/initialState";

describe("Administrative Bloc readout", () => {
  it("provides one labeled source for all seven constituencies and cross-screen signals", () => {
    const state = createInitialState();
    const readout = getAdministrativeReadout(state)!;
    expect(Object.keys(ADMINISTRATIVE_COHORT_LABELS)).toHaveLength(7);
    expect(readout.faction.id).toBe(ADMINISTRATIVE_BLOC_ID);
    expect(readout.staffing.total).toBe(state.officers.length);
    expect(Object.keys(readout.surface).sort()).toEqual(["districts", "economy", "finances", "law", "officers"]);
    for (const rows of Object.values(readout.surface)) {
      expect(rows).toHaveLength(3);
      expect(rows.every(row => row.label.length > 0 && row.value.length > 0)).toBe(true);
    }
  });

  it("surfaces active demand state and readable reform effect labels", () => {
    const state = createInitialState();
    state.cityStats.corruption = 80;
    const bloc = state.factions.find(faction => faction.id === ADMINISTRATIVE_BLOC_ID)!;
    state.activeEvents = [makeAdministrativeDemandEvent(state, bloc)];
    const readout = getAdministrativeReadout(state)!;
    expect(readout.demand?.factionId).toBe(ADMINISTRATIVE_BLOC_ID);
    expect(readout.demand?.responseOptions?.length).toBe(4);
    expect(formatAdministrativeEffectLabel("administrativeCapacity")).toBe("Administrative capacity");
    expect(formatAdministrativeEffectLabel("factionLoyalty")).toBe("Faction loyalty");
  });

  it("wires the same panel into every relevant operational screen", () => {
    const root = path.resolve(__dirname, "../..");
    const screens = ["factions", "economy", "finances", "law", "officers", "districts"];
    for (const screen of screens) {
      const source = fs.readFileSync(path.join(root, "app/(game)", `${screen}.tsx`), "utf8");
      expect(source, `${screen} imports shared Administrative Bloc panel`).toContain(
        'import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel"',
      );
      expect(source, `${screen} renders shared Administrative Bloc panel`).toContain("<AdministrativeBlocPanel");
    }
  });
});