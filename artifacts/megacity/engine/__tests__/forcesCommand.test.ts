import { describe, expect, it } from "vitest";
import { buildForcesCommandOverview } from "@/engine/forcesCommand";

describe("unified forces command projection", () => {
  it("reconciles assets once and keeps the retinue separate", () => {
    const overview = buildForcesCommandOverview({
      units: { cityDefenseInfantry: 3, patrolCars: 4 } as any,
      resources: { armaments: 12, missiles: 5, ammo: 80 } as any,
      militaryOverhaul: {
        standingArmy: { infantry: 3, armor: 0, artillery: 0, airSupport: 0, specialOps: 0, support: 0, totalStrength: 3, readiness: 42, morale: 61, deployedOnMission: 1 },
        activeMissions: [],
        logistics: {
          personnelTotal: 30, fleetOperational: { patrolCars: 0.5 }, installationsBuilt: { military_hq: 2, bogus: 99 },
          fleetCondition: { patrolCars: 70 }, crewCoverage: 0.5, garrisonCoverage: 0.75, supplyStatus: "shortage",
        },
      } as any,
      retinue: { troops: [{ id: "t", status: "ready" }], captains: [], squads: [{ id: "s", captainId: null }] } as any,
    });
    expect(overview.personnel).toBe(30);
    expect(overview.vehicles).toBe(4);
    expect(overview.operationalVehicles).toBe(2);
    expect(overview.installations).toBe(2);
    expect(overview.sections.find((section) => section.id === "armed")?.metrics).toContainEqual({ label: "Vehicles below full condition", value: "4", alert: true });
    expect(overview.sections.find((section) => section.id === "districts")?.metrics).toContainEqual({ label: "Installation upkeep", value: "4,000 cr/tick" });
    expect(overview.sections.find((section) => section.id === "armed")?.metrics).toContainEqual({ label: "Missiles", value: "5" });
    expect(overview.sections.find((section) => section.id === "retinue")?.metrics).toContainEqual({ label: "Leaderless formations", value: "1", alert: true });
    expect(overview.sections.find((section) => section.id === "districts")?.metrics).toContainEqual({ label: "Supply status", value: "SHORTAGE", alert: true });
  });

  it("handles empty and malformed partial state", () => {
    const overview = buildForcesCommandOverview({
      units: null as any,
      officers: [null, { appointed: true, position: "Defense High Commander", name: {} }] as any,
      districts: [null, {}] as any,
      retinue: { squads: [null], captains: [null], troops: [null] } as any,
    });
    expect(overview.personnel).toBe(0);
    expect(overview.sections).toHaveLength(6);
    expect(overview.sections.every((section) => section.metrics.every((metric) => !metric.value.includes("NaN")))).toBe(true);
  });

  it("uses exact command posts and ignores stale cached personnel", () => {
    const overview = buildForcesCommandOverview({
      units: { cityDefenseInfantry: 2, patrolJudges: 3, blackOpsUnits: 1 } as any,
      officers: [
        { appointed: true, position: "Defense High Commander", name: "Voss" },
        { appointed: true, position: "Unrelated Post", name: "Wrong" },
      ] as any,
      militaryOverhaul: { logistics: { personnelTotal: 9999 }, standingArmy: {} } as any,
    });
    expect(overview.personnel).toBe(60);
    expect(overview.sections.find((section) => section.id === "supreme")?.commander).toBe("Voss");
    expect(overview.sections.find((section) => section.id === "armed")?.commander).toBeNull();
    expect(overview.sections.find((section) => section.id === "armed")?.metrics[0].value).toBe("20");
    expect(overview.sections.find((section) => section.id === "security")?.metrics[0].value).toBe("30");
    expect(overview.sections.find((section) => section.id === "intelligence")?.metrics[0].value).toBe("10");
  });

  it("projects each live asset into exactly one branch and reconciles branch totals", () => {
    const overview = buildForcesCommandOverview({
      units: {
        cityDefenseInfantry: 3,
        patrolJudges: 4,
        intelligenceOfficers: 2,
        patrolCars: 5,
      } as any,
      resources: { ammo: 0 } as any,
      militaryOverhaul: {
        standingArmy: { readiness: 40, morale: 50, deployedOnMission: 2 },
        activeMissions: [{ id: "m1" }],
        logistics: {
          fleetOperational: { patrolCars: 0.4 },
          fleetCondition: { patrolCars: 65 },
          installationsBuilt: { military_hq: 2 },
          garrisonCoverage: 0.6,
          supplyStatus: "critical",
        },
      } as any,
      retinue: {
        troops: [
          { id: "t1", status: "ready", squadId: "s1" },
          { id: "t2", status: "deployed", squadId: "s1" },
          { id: "t3", status: "ready", squadId: null },
        ],
        captains: [],
        squads: [{ id: "s1", name: "North Watch", captainId: null, troopIds: ["t1", "t2"] }],
      } as any,
    });
    const section = (id: string) => overview.sections.find((candidate) => candidate.id === id)!;
    const armed = section("armed");
    const security = section("security");
    const intelligence = section("intelligence");
    const retinue = section("retinue");
    const districts = section("districts");
    expect(armed.assets.filter((asset) => asset.kind === "unit").reduce((sum, asset) => sum + asset.count, 0)).toBe(3);
    expect(armed.assets.find((asset) => asset.id === "vehicle-patrolCars")?.statuses).toEqual(
      expect.arrayContaining(["damaged", "understaffed", "undersupplied"]),
    );
    expect(armed.assets.find((asset) => asset.id === "armed-deployed-missions")?.statuses).toContain("deployed");
    expect(security.assets.reduce((sum, asset) => sum + asset.count, 0)).toBe(4);
    expect(intelligence.assets.reduce((sum, asset) => sum + asset.count, 0)).toBe(2);
    expect(retinue.assets.reduce((sum, asset) => sum + asset.count, 0)).toBe(3);
    expect(retinue.assets.find((asset) => asset.id === "squad-s1")?.statuses).toEqual(
      expect.arrayContaining(["deployed", "leaderless"]),
    );
    expect(districts.assets.reduce((sum, asset) => sum + asset.count, 0)).toBe(2);
    expect(new Set([
      ...armed.assets.map((asset) => asset.id),
      ...security.assets.map((asset) => asset.id),
      ...intelligence.assets.map((asset) => asset.id),
      ...retinue.assets.map((asset) => asset.id),
      ...districts.assets.map((asset) => asset.id),
    ]).size).toBe(
      armed.assets.length + security.assets.length + intelligence.assets.length + retinue.assets.length + districts.assets.length,
    );
  });

  it("keeps the command UI on the existing military route with collapsible accessible sections", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/(game)/military.tsx", "utf8")
    );
    expect(source).toContain('{ key: "overview", label: "COMMAND"');
    expect(source).toContain('accessibilityState={{ expanded }}');
    expect(source).toContain('target === "officers" || target === "retinue" || target === "districts"');
    expect(source).toContain('{milTab === "overview" && renderOverviewTab()}');
  });
});