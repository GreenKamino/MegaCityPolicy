import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { sanitizeState, ARRAY_CAPS } from "@/engine/sanitizer";
import {
  cancelRailCorridor,
  configureRailCorridorStaffing,
  getEligibleRailEndpoints,
  getRailNetworkDiagnostics,
  getRailDistanceAndDuration,
  installRailTrainUpgrade,
  processRailNetworkTick,
  proposeRailCorridor,
  respondToRailConsent,
  resumeRailCorridor,
  STANDARD_RAIL_CREW,
  AUTOMATED_RAIL_CREW,
} from "@/engine/railNetwork";
import type { GameState, RailCorridor } from "@/engine/types";

const staff = { ...STANDARD_RAIL_CREW };
function state(): GameState {
  const s = createInitialState();
  s.resources = { ...s.resources, credits: 100_000, steel: 100_000 };
  s.unlockedTechnologies = ["basic_railways"];
  s.externalMegacities = [{
    id: "ally", name: "Allied City", description: "no coordinates in text", influence: 1, loyalty: 80, threat: 0,
    isActive: true, tradeInventory: {}, lastRefreshTick: 0, factionType: "megacity",
    railLocation: { id: "world-ally", x: 30, y: 40 },
  }];
  s.townships = [{
    id: "town", name: "Allied Township", description: "", population: 100, loyalty: 70, threat: 0, influence: 1,
    status: "allied", factionType: "township", railLocation: { id: "world-town", x: 3, y: 4 },
  }];
  return s;
}
function proposeAccepted(s = state()) {
  const proposed = proposeRailCorridor(s, "ally", staff);
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.reason);
  const accepted = respondToRailConsent(proposed.state, proposed.corridor!.id, true);
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) throw new Error(accepted.reason);
  return accepted.state;
}

describe("rail network", () => {
  it("resolves production entities from canonical map coordinates without leaking hidden locations", () => {
    const production = createInitialState();
    const ids = getEligibleRailEndpoints(production).map(endpoint => endpoint.id);
    expect(ids).toContain("nova-pacifica");
    // `silent-ark` has an authoritative position but is an undiscovered
    // world location; adding an active generic partner must not reveal it.
    production.externalMegacities.push({
      id: "silent-ark", name: "Hidden generic", description: "", influence: 1, loyalty: 80, threat: 0,
      isActive: true, tradeInventory: {}, lastRefreshTick: 0, factionType: "megacity",
    });
    expect(getEligibleRailEndpoints(production).map(endpoint => endpoint.id)).not.toContain("silent-ark");
  });

  it("uses authoritative locations, excludes hostile/fallen/inactive/Continuance, and requires explicit controlled ports", () => {
    const s = state();
    s.externalMegacities.push({
      ...s.externalMegacities[0], id: "hostile", railLocation: { id: "h", x: 1, y: 1 }, stance: "hostile",
    }, {
      ...s.externalMegacities[0], id: "controlled-no-port", controlStatus: "annexed", railLocation: { id: "c", x: 1, y: 1 },
    }, {
      ...s.externalMegacities[0], id: "controlled-port", controlStatus: "occupied", railLocation: { id: "p", x: 1, y: 1, railPort: true },
    }, {
      ...s.externalMegacities[0], id: "inactive", isActive: false, railLocation: { id: "i", x: 1, y: 1 },
    });
    const ends = getEligibleRailEndpoints(s);
    expect(ends.map(x => x.id)).toEqual(["ally", "controlled-no-port", "controlled-port", "town"]);
    expect(ends.find(x => x.id === "ally")!.needsConsent).toBe(true);
    expect(ends.find(x => x.id === "controlled-port")!.needsConsent).toBe(false);
  });

  it("keeps controlled non-port cities eligible and recognizes a controlled stable-ID port", () => {
    const s = createInitialState();
    const nova = s.externalMegacities.find(entity => entity.id === "nova-pacifica")!;
    s.externalMegacities = [{ ...nova, controlStatus: "annexed" }];
    const port = s.townships!.find(entity => entity.id === "port-sulphur")!;
    s.townships = [{ ...port, controlStatus: "occupied" }];
    const endpoints = getEligibleRailEndpoints(s);
    expect(endpoints.find(endpoint => endpoint.id === "nova-pacifica")).toMatchObject({ controlled: true, needsConsent: false });
    expect(endpoints.find(endpoint => endpoint.id === "port-sulphur")).toMatchObject({ controlled: true, needsConsent: false });
  });

  it("proposes deterministically, freezes a 5-15 year duration, and receives/refuses/expires consent", () => {
    const s = state();
    const a = proposeRailCorridor(s, "ally", staff);
    const b = proposeRailCorridor(s, "ally", staff);
    expect(a.ok && b.ok && !!a.corridor).toBe(true);
    if (!a.ok || !b.ok || !a.corridor || !b.corridor) return;
    const schedule = getRailDistanceAndDuration(s, "ally");
    expect(schedule.ok && a.corridor.distance).toBe(schedule.ok ? schedule.distance : 0);
    expect(a.corridor.totalTicks).toBe(schedule.ok ? schedule.totalTicks : 0);
    expect(a.corridor.totalTicks).toBeGreaterThanOrEqual(schedule.ok ? schedule.setbackTicks : 0);
    expect(a.corridor.totalTicks).toBe(b.corridor!.totalTicks);
    const year = Math.round(24 * 60 / s.tickIntervalMinutes) * 365;
    expect(a.corridor.totalTicks).toBeGreaterThanOrEqual(5 * year);
    expect(a.corridor.totalTicks).toBeLessThanOrEqual(15 * year);
    const refused = respondToRailConsent(a.state, a.corridor.id, false);
    expect(refused.ok && refused.corridor?.reason).toBe("consent_refused");
    const expired = processRailNetworkTick({ ...a.state, totalTicks: a.corridor.consentExpiresTick! });
    expect(expired.railCorridors![0].reason).toBe("consent_expired");
  });

  it("is non-mutating, progresses only once per tick, cancels, and disrupts on endpoint loss", () => {
    const accepted = proposeAccepted();
    const before = JSON.stringify(accepted);
    const once = processRailNetworkTick(accepted);
    expect(JSON.stringify(accepted)).toBe(before);
    expect(once.railCorridors![0].progressTicks).toBe(1);
    const cancelled = cancelRailCorridor(once, once.railCorridors![0].id);
    expect(cancelled.ok && cancelled.corridor?.status).toBe("cancelled");
    const live = proposeAccepted();
    const lost = processRailNetworkTick({ ...live, externalMegacities: [{ ...live.externalMegacities[0], isActive: false }] });
    expect(lost.railCorridors![0]).toMatchObject({ status: "disrupted", reason: "endpoint_control_or_war_loss" });
  });

  it("allows robots only for rail labor and reports staffing shortages", () => {
    const s = state();
    const p = proposeRailCorridor(s, "ally", AUTOMATED_RAIL_CREW);
    if (!p.ok) throw new Error(p.reason);
    const accepted = respondToRailConsent(p.state, p.corridor!.id, true);
    if (!accepted.ok) throw new Error(accepted.reason);
    expect(processRailNetworkTick(accepted.state).railCorridors![0].progressTicks).toBe(1);
    const unsafe = { ...accepted.state, railCorridors: [{ ...accepted.state.railCorridors![0], staffing: { ...staff, robots: 100, railWorkers: 0, engineers: 0, maintenance: 0 } }] };
    expect(getRailNetworkDiagnostics(unsafe).warnings).toEqual([
      "Understaffed corridor: Allied City — missing engineers (2), maintenance crew (1).",
    ]);
    expect(processRailNetworkTick(unsafe).railCorridors![0].progressTicks).toBe(0);
  });

  it("stalls an unstaffed corridor, supports bounded immutable configuration, and exposes role totals", () => {
    const proposed = proposeRailCorridor(state(), "ally");
    if (!proposed.ok) throw new Error(proposed.reason);
    const accepted = respondToRailConsent(proposed.state, proposed.corridor!.id, true);
    if (!accepted.ok) throw new Error(accepted.reason);
    expect(processRailNetworkTick(accepted.state).railCorridors![0].progressTicks).toBe(0);
    const configured = configureRailCorridorStaffing(accepted.state, accepted.corridor!.id, {
      ...STANDARD_RAIL_CREW, engineers: 999_999, maintenance: -1,
    });
    if (!configured.ok) throw new Error(configured.reason);
    expect(accepted.state.railCorridors![0].staffing.engineers).toBe(0);
    expect(configured.corridor!.staffing).toMatchObject({ engineers: 100_000, maintenance: 0 });
    const diagnostics = getRailNetworkDiagnostics(configured.state);
    expect(diagnostics.staffing[0]).toMatchObject({
      requiredJobs: { engineers: 2, railWorkers: 10, maintenance: 1 },
      staffedJobs: { engineers: 100_000, maintenance: 0 },
    });
    expect(diagnostics.staffing[0].shortages).toContainEqual(expect.objectContaining({ role: "maintenance", missing: 1 }));
  });

  it("resumes a disrupted route only when its endpoint has become eligible", () => {
    const accepted = proposeAccepted();
    const disrupted = { ...accepted, railCorridors: [{ ...accepted.railCorridors![0], status: "disrupted" as const, reason: "war" }] };
    const resumed = resumeRailCorridor(disrupted, disrupted.railCorridors![0].id);
    expect(resumed.ok && resumed.corridor?.status).toBe("under_construction");
    const hidden = { ...disrupted, externalMegacities: [{ ...disrupted.externalMegacities[0], isActive: false }] };
    expect(resumeRailCorridor(hidden, hidden.railCorridors![0].id)).toMatchObject({ ok: false, reason: "endpoint_ineligible" });
    expect(resumeRailCorridor(accepted, accepted.railCorridors![0].id)).toMatchObject({ ok: false, reason: "corridor_not_disrupted" });
    expect(AUTOMATED_RAIL_CREW).toMatchObject({ railWorkers: 0, robots: 10, engineers: 2, maintenance: 1 });
  });

  it("completes a staffed route, refreshes research capabilities, and suppresses benefits when accountability is missing", () => {
    const s = state();
    s.unlockedTechnologies.push("rail_freight_systems", "railway_electrification", "passenger_intermodal_rail", "advanced_train_designs");
    const accepted = proposeAccepted(s);
    const r = accepted.railCorridors![0];
    expect(r.status).toBe("under_construction");
    expect(r.capabilities).toEqual(expect.arrayContaining(["commercial", "passenger", "freight", "industrial", "intermodal"]));
    const completed = { ...accepted, railCorridors: [{ ...r, progressTicks: r.totalTicks - 1 }] };
    const done = processRailNetworkTick(completed);
    expect(done.railCorridors![0].status).toBe("completed");
    expect(getRailNetworkDiagnostics(done)).toMatchObject({
      completed: 1,
      transitCapacity: 120,
      tradeIncome: 12,
      industrialOutput: 2,
      passengerCapacity: 100,
      freightCapacity: 80,
      warnings: [],
    });

    const upgraded = {
      ...done,
      unlockedTechnologies: [...done.unlockedTechnologies, "magnetic_levitation_rail"],
    };
    const refreshed = processRailNetworkTick(upgraded);
    expect(refreshed.railCorridors![0].status).toBe("completed");
    expect(refreshed.railCorridors![0].capabilities).toEqual(
      expect.arrayContaining(["commercial", "passenger", "freight", "industrial", "intermodal"]),
    );
    expect(getRailNetworkDiagnostics(refreshed)).toMatchObject({
      passengerCapacity: 100,
      freightCapacity: 80,
      industrialOutput: 2,
      warnings: [],
    });

    const missingAccountability = {
      ...refreshed,
      railCorridors: [{
        ...refreshed.railCorridors![0],
        staffing: { ...STANDARD_RAIL_CREW, maintenance: 0 },
      }],
    };
    const stalled = getRailNetworkDiagnostics(missingAccountability);
    expect(missingAccountability.railCorridors![0].status).toBe("completed");
    expect(stalled.warnings).toContain("Understaffed corridor: Allied City — missing maintenance crew (1).");
    expect(stalled).toMatchObject({
      completed: 1,
      transitCapacity: 0,
      tradeIncome: 0,
      industrialOutput: 0,
      passengerCapacity: 0,
      freightCapacity: 0,
    });
  });

  it("falls back to the stable corridor ID when a legacy endpoint is unavailable", () => {
    const s = state();
    s.railCorridors = [{
      version: 1,
      id: "rail:legacy-endpoint:42",
      endpointId: "legacy-endpoint",
      endpointKind: "megacity",
      endpointLocationId: "legacy-endpoint",
      status: "completed",
      proposalTick: 0,
      distance: 100,
      totalTicks: 100,
      progressTicks: 100,
      setbackTicks: 0,
      capabilities: ["commercial"],
      staffing: { ...STANDARD_RAIL_CREW, security: 0 },
    }];

    expect(getRailNetworkDiagnostics(s).warnings).toEqual([
      "Understaffed corridor: rail:legacy-endpoint:42 — missing security officers (1).",
    ]);
  });

  it("defaults legacy saves and rejects malformed corridors while enforcing its cap", () => {
    const s = state();
    expect(sanitizeState({ ...s, railCorridors: undefined }).railCorridors).toEqual([]);
    const bad = sanitizeState({ ...s, railCorridors: [{ nope: true }, ...Array.from({ length: ARRAY_CAPS.railCorridors + 2 }, (_, i) => ({
      version: 1, id: `r${i}`, endpointId: `e${i}`, endpointKind: "megacity", endpointLocationId: `l${i}`, status: "completed",
      proposalTick: i, distance: 1, totalTicks: 1, progressTicks: 0, setbackTicks: 0, capabilities: [], staffing: {},
    }))] as unknown as RailCorridor[] });
    expect(bad.railCorridors).toHaveLength(ARRAY_CAPS.railCorridors);
    expect(bad.railCorridors![0].id).toBe("r2");
  });

  it("installs researched train modules once, charges both resources, and exposes live effects", () => {
    const s = state();
    s.unlockedTechnologies.push(
      "rail_freight_systems", "railway_electrification", "passenger_intermodal_rail",
      "advanced_train_designs", "armored_train_plating", "troop_transport_carriages",
      "weaponized_escort_cars",
    );
    const accepted = proposeAccepted(s);
    const corridor = accepted.railCorridors![0];
    const completed = processRailNetworkTick({
      ...accepted,
      railCorridors: [{ ...corridor, progressTicks: corridor.totalTicks - 1 }],
    });
    const before = completed.resources;
    const installed = installRailTrainUpgrade(completed, corridor.id, "armored_train_plating");
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.state.resources.credits).toBe(before.credits - 4_500);
    expect(installed.state.resources.steel).toBe(before.steel - 1_200);
    expect(installed.corridor?.installedTrainUpgrades).toEqual(["armored_train_plating"]);
    expect(installed.state.pendingTickEntries?.slice(-2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ unit: "credits", delta: -4_500 }),
      expect.objectContaining({ unit: "steel", delta: -1_200 }),
    ]));
    expect(installRailTrainUpgrade(installed.state, corridor.id, "armored_train_plating")).toMatchObject({
      ok: false, reason: "upgrade_already_installed",
    });
    const troop = installRailTrainUpgrade(installed.state, corridor.id, "troop_transport_carriages");
    expect(troop.ok).toBe(true);
    if (!troop.ok) return;
    const weapon = installRailTrainUpgrade(troop.state, corridor.id, "weaponized_escort_cars");
    expect(weapon.ok).toBe(true);
    if (!weapon.ok) return;
    expect(getRailNetworkDiagnostics(weapon.state)).toMatchObject({
      safetyResilience: 25,
      armedSecurityBenefit: 16,
      troopTransportCapacity: 40,
      safetyRating: 75,
    });
    expect(getRailNetworkDiagnostics(weapon.state).operationalTrainUpgrades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          upgradeId: "armored_train_plating",
          name: "Armored train plating",
          effects: { safetyResilience: 20 },
        }),
        expect.objectContaining({
          upgradeId: "troop_transport_carriages",
          name: "Troop-transport carriages",
          effects: { troopTransportCapacity: 40 },
        }),
        expect.objectContaining({
          upgradeId: "weaponized_escort_cars",
          name: "Weaponized escort cars",
          effects: { safetyResilience: 5, armedSecurityBenefit: 16 },
        }),
      ]),
    );

    for (const status of ["under_construction", "cancelled"] as const) {
      const inactive = {
        ...weapon.state,
        railCorridors: [{ ...weapon.state.railCorridors![0], status }],
      };
      expect(getRailNetworkDiagnostics(inactive).operationalTrainUpgrades).toEqual([]);
    }

    const understaffed = {
      ...weapon.state,
      railCorridors: [{
        ...weapon.state.railCorridors![0],
        staffing: { ...STANDARD_RAIL_CREW, security: 0 },
      }],
    };
    expect(getRailNetworkDiagnostics(understaffed).operationalTrainUpgrades).toEqual([]);
  });

  it("requires research, completion, and a non-cancelled route before installing", () => {
    const accepted = proposeAccepted();
    expect(installRailTrainUpgrade(accepted, accepted.railCorridors![0].id, "armored_train_plating")).toMatchObject({
      ok: false, reason: "corridor_not_completed",
    });
    const complete = {
      ...accepted,
      unlockedTechnologies: [...accepted.unlockedTechnologies, "advanced_train_designs"],
      railCorridors: [{ ...accepted.railCorridors![0], status: "completed" as const }],
    };
    expect(installRailTrainUpgrade(complete, complete.railCorridors[0].id, "armored_train_plating")).toMatchObject({
      ok: false, reason: "missing_research:armored_train_plating",
    });
    const cancelled = {
      ...complete,
      unlockedTechnologies: [...complete.unlockedTechnologies, "armored_train_plating"],
      railCorridors: [{ ...complete.railCorridors[0], status: "cancelled" as const }],
    };
    expect(installRailTrainUpgrade(cancelled, cancelled.railCorridors[0].id, "armored_train_plating")).toMatchObject({
      ok: false, reason: "corridor_not_completed",
    });
  });
});