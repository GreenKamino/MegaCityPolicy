import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  EXPORT_SCHEMA_VERSION,
  FULL_BACKUP_SCHEMA_VERSION,
  parseFullBackup,
  parseSaveImport,
  serializeFullBackup,
  serializeSaveExport,
  suggestedFileName,
  suggestedFullBackupFileName,
} from "@/engine/saveExport";
import { ALL_BASE_ACHIEVEMENTS, checkAchievements } from "@/engine/achievements";
import {
  PERSONAL_ACTION_DECAY_WINDOW_TICKS,
  applyPersonalInteraction,
  formatPersonalActionSubtitle,
  personalCooldownKey,
  type PersonalInteractionTarget,
} from "@/engine/interactionMenu";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

describe("saveExport.serializeSaveExport", () => {
  it("produces a versioned envelope with the source slot and metadata", () => {
    const state = createInitialState();
    state.cityName = "NEO ATLANTA";
    state.player.name = "TEST COMMANDER";
    state.player.level = 7;
    state.totalTicks = 123;

    const json = serializeSaveExport(state, 3);
    const env = JSON.parse(json);

    expect(env.format).toBe("megacity-save-export");
    expect(env.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(env.sourceSlot).toBe(3);
    expect(env.cityName).toBe("NEO ATLANTA");
    expect(env.playerName).toBe("TEST COMMANDER");
    expect(env.playerLevel).toBe(7);
    expect(env.totalTicks).toBe(123);
    expect(env.state).toBeTruthy();
  });
});

describe("saveExport.parseSaveImport", () => {
  it("round-trips a serialized state", () => {
    const state = createInitialState();
    const json = serializeSaveExport(state, 1);
    const result = parseSaveImport(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.state.player.name).toBe(state.player.name);
      expect(result.envelope.sourceSlot).toBe(1);
    }
  });

  it("preserves current squad upgrade tiers through export and load normalization", () => {
    const state = createInitialState();
    state.unitUpgradeTiers = {
      cityDefenseInfantry: 3,
      heavyRiotMechUnits: 2,
    };

    const result = parseSaveImport(serializeSaveExport(state, 1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const restored = sanitizeState(migrateState(result.envelope.state));
    expect(restored.unitUpgradeTiers).toEqual(state.unitUpgradeTiers);
  });

  it("preserves installed rail train modules through export and load normalization", () => {
    const state = createInitialState();
    state.railCorridors = [{
      version: 1,
      id: "rail:test:1",
      endpointId: "nova-pacifica",
      endpointKind: "megacity",
      endpointLocationId: "nova-pacifica",
      status: "completed",
      proposalTick: 1,
      distance: 10,
      totalTicks: 100,
      progressTicks: 100,
      setbackTicks: 0,
      capabilities: ["commercial"],
      staffing: { robots: 0, engineers: 2, railWorkers: 10, security: 1, ticketing: 1, admin: 1, maintenance: 1 },
      installedTrainUpgrades: ["armored_train_plating", "troop_transport_carriages"],
    }];
    const result = parseSaveImport(serializeSaveExport(state, 1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = sanitizeState(migrateState(result.envelope.state));
    expect(restored.railCorridors?.[0].installedTrainUpgrades).toEqual([
      "armored_train_plating", "troop_transport_carriages",
    ]);
  });

  it("rejects non-JSON input", () => {
    const result = parseSaveImport("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/);
  });

  it("rejects JSON that is not an object", () => {
    const result = parseSaveImport("42");
    expect(result.ok).toBe(false);
  });

  it("rejects envelopes with the wrong format tag", () => {
    const result = parseSaveImport(JSON.stringify({ format: "other-app", schemaVersion: 1, state: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/MEGACITY/i);
  });

  it("rejects envelopes from a newer schema version", () => {
    const state = createInitialState();
    const env = {
      format: "megacity-save-export",
      schemaVersion: EXPORT_SCHEMA_VERSION + 5,
      appVersion: "x",
      buildNumber: 0,
      exportedAt: 0,
      sourceSlot: 1,
      cityName: state.cityName,
      playerName: state.player.name,
      playerLevel: 1,
      totalTicks: 0,
      state,
    };
    const result = parseSaveImport(JSON.stringify(env));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer/i);
  });

  it("rejects envelopes missing required state sections", () => {
    const env = {
      format: "megacity-save-export",
      schemaVersion: EXPORT_SCHEMA_VERSION,
      appVersion: "x",
      buildNumber: 0,
      exportedAt: 0,
      sourceSlot: 1,
      cityName: "MC",
      playerName: "P",
      playerLevel: 1,
      totalTicks: 0,
      state: { player: { name: "P" } },
    };
    const result = parseSaveImport(JSON.stringify(env));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required sections/i);
  });
});

describe("saveExport relationship fatigue persistence", () => {
  it("keeps recent faction and officer gifts reduced through wrapped export/import, then restores full strength after decay", () => {
    const initial = createInitialState();
    const factionTarget: PersonalInteractionTarget = {
      kind: "faction",
      id: initial.factions[0].id,
    };
    const officerTarget: PersonalInteractionTarget = {
      kind: "officer",
      id: initial.officers[0].id,
    };
    const giftedFaction = {
      ...initial,
      totalTicks: 100,
      messages: [],
    };
    const giftedOfficer = applyPersonalInteraction(
      applyPersonalInteraction(giftedFaction, factionTarget, "give-gift"),
      officerTarget,
      "give-gift",
    );

    const exported = serializeSaveExport(giftedOfficer, 2);
    const parsed = parseSaveImport(exported);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Mirror importSlot's wrapped restore path rather than only checking the
    // raw envelope: imported slots are migrated and sanitized before use.
    const restored = sanitizeState(migrateState(parsed.envelope.state));
    expect(restored.personalActionHistory?.[personalCooldownKey(factionTarget, "give-gift")]).toEqual([100]);
    expect(restored.personalActionHistory?.[personalCooldownKey(officerTarget, "give-gift")]).toEqual([100]);

    for (const target of [factionTarget, officerTarget]) {
      const kind = target.kind;
      expect(
        formatPersonalActionSubtitle(kind, "give-gift", {
          target,
          history: restored.personalActionHistory,
          totalTicks: 100,
        }),
      ).toContain("Reduced effect: 60%");
      expect(
        formatPersonalActionSubtitle(kind, "give-gift", {
          target,
          history: restored.personalActionHistory,
          totalTicks: 100 + PERSONAL_ACTION_DECAY_WINDOW_TICKS + 1,
        }),
      ).toContain("+8 loyalty");
      expect(
        formatPersonalActionSubtitle(kind, "give-gift", {
          target,
          history: restored.personalActionHistory,
          totalTicks: 100 + PERSONAL_ACTION_DECAY_WINDOW_TICKS + 1,
        }),
      ).not.toContain("Reduced effect");
    }
  });
});

// Tamper sealing (schema v2): imports load normally but any missing or
// mismatched stateChecksum silently marks the state integrityCompromised,
// which permanently stops achievements. Same contract as unwrapSave.
describe("saveExport tamper sealing", () => {
  it("an unedited export imports clean — no compromised mark", () => {
    const state = createInitialState();
    const result = parseSaveImport(serializeSaveExport(state, 1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.state.integrityCompromised).toBeUndefined();
    }
  });

  it("editing a value in the exported file marks the import compromised, but it still loads", () => {
    const state = createInitialState();
    const env = JSON.parse(serializeSaveExport(state, 1));
    env.state.resources.credits = 999999999;
    const result = parseSaveImport(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.state.resources.credits).toBe(999999999);
      expect(result.envelope.state.integrityCompromised).toBe(true);
    }
  });

  it("deleting the checksum field is not a bypass — missing checksum also marks", () => {
    const state = createInitialState();
    const env = JSON.parse(serializeSaveExport(state, 1));
    env.state.resources.credits = 999999999;
    delete env.stateChecksum;
    const result = parseSaveImport(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.state.integrityCompromised).toBe(true);
  });

  it("re-formatting the file without changing values stays clean", () => {
    // Whitespace-only edits (e.g. an editor re-indenting) must not flag:
    // the checksum is over the parsed state's compact serialization.
    const state = createInitialState();
    const env = JSON.parse(serializeSaveExport(state, 1));
    const reformatted = JSON.stringify(env); // compact, no indentation
    const result = parseSaveImport(reformatted);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.state.integrityCompromised).toBeUndefined();
    }
  });

  it("a compromised import earns no achievements; a clean one does", () => {
    const state = createInitialState();
    state.lastSeenVersion = "1.0.0"; // satisfies the changelog_seen check
    const clean = parseSaveImport(serializeSaveExport(state, 1));
    expect(clean.ok).toBe(true);
    if (clean.ok) {
      expect(checkAchievements(clean.envelope.state).length).toBeGreaterThan(0);
    }
    const env = JSON.parse(serializeSaveExport(state, 1));
    env.state.totalTicks = 999999;
    const tampered = parseSaveImport(JSON.stringify(env));
    expect(tampered.ok).toBe(true);
    if (tampered.ok) {
      expect(checkAchievements(tampered.envelope.state)).toEqual([]);
    }
  });

  it("full backup: only the edited slot is marked, other slots import clean", () => {
    const a = createInitialState();
    a.cityName = "ALPHA";
    const b = createInitialState();
    b.cityName = "BETA";
    const env = JSON.parse(
      serializeFullBackup(
        [
          { slot: 1, state: a },
          { slot: 2, state: b },
        ],
        null,
      ),
    );
    env.slots[1].state.resources.credits = 999999999;
    const result = parseFullBackup(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.slots[0].state.integrityCompromised).toBeUndefined();
      expect(result.envelope.slots[1].state.integrityCompromised).toBe(true);
    }
  });
});

describe("saveExport.suggestedFileName", () => {
  it("includes the city name, slot, and date", () => {
    const state = createInitialState();
    state.cityName = "NEO ATLANTA";
    const env = JSON.parse(serializeSaveExport(state, 4));
    const name = suggestedFileName(env);
    expect(name).toMatch(/megacity_NEO_ATLANTA_slot4_\d{8}\.json/);
  });

  it("sanitizes unsafe filename characters", () => {
    const state = createInitialState();
    state.cityName = "weird/city: name";
    const env = JSON.parse(serializeSaveExport(state, 2));
    const name = suggestedFileName(env);
    expect(name).not.toMatch(/[\/:]/);
  });
});

describe("saveExport.serializeFullBackup / parseFullBackup", () => {
  it("round-trips multiple slots and settings", () => {
    const a = createInitialState();
    a.cityName = "ALPHA";
    a.player.name = "ONE";
    const b = createInitialState();
    b.cityName = "BETA";
    b.player.name = "TWO";
    b.totalTicks = 42;

    const json = serializeFullBackup(
      [
        { slot: 1, state: a },
        { slot: 3, state: b },
      ],
      { soundMuted: true, fontScale: "large" },
    );

    const parsed = parseFullBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.format).toBe("megacity-full-backup");
    expect(parsed.envelope.schemaVersion).toBe(FULL_BACKUP_SCHEMA_VERSION);
    expect(parsed.envelope.slots).toHaveLength(2);
    expect(parsed.envelope.slots[0].slot).toBe(1);
    expect(parsed.envelope.slots[0].cityName).toBe("ALPHA");
    expect(parsed.envelope.slots[1].slot).toBe(3);
    expect(parsed.envelope.slots[1].state.totalTicks).toBe(42);
    expect(parsed.envelope.settings).toEqual({ soundMuted: true, fontScale: "large" });
  });

  it("rejects backups missing required state sections", () => {
    const broken = JSON.stringify({
      format: "megacity-full-backup",
      schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
      appVersion: "x",
      buildNumber: 1,
      exportedAt: 0,
      slots: [{ slot: 1, state: { player: { name: "x" } } }],
      settings: null,
    });
    const result = parseFullBackup(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required state sections/);
  });

  it("rejects unrecognised file formats", () => {
    const result = parseFullBackup(JSON.stringify({ format: "something-else" }));
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range slot ids", () => {
    const a = createInitialState();
    const json = JSON.stringify({
      format: "megacity-full-backup",
      schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
      appVersion: "x",
      buildNumber: 1,
      exportedAt: 0,
      slots: [{ slot: 99, cityName: "X", playerName: "X", playerLevel: 1, totalTicks: 0, state: a }],
      settings: null,
    });
    const result = parseFullBackup(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid slot id/);
  });

  it("rejects duplicate slot ids", () => {
    const a = createInitialState();
    const b = createInitialState();
    const json = JSON.stringify({
      format: "megacity-full-backup",
      schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
      appVersion: "x",
      buildNumber: 1,
      exportedAt: 0,
      slots: [
        { slot: 1, cityName: "A", playerName: "A", playerLevel: 1, totalTicks: 0, state: a },
        { slot: 1, cityName: "B", playerName: "B", playerLevel: 1, totalTicks: 0, state: b },
      ],
      settings: null,
    });
    const result = parseFullBackup(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicate/);
  });

  it("rejects schema versions newer than this client", () => {
    const json = JSON.stringify({
      format: "megacity-full-backup",
      schemaVersion: FULL_BACKUP_SCHEMA_VERSION + 5,
      appVersion: "x",
      buildNumber: 1,
      exportedAt: 0,
      slots: [],
      settings: null,
    });
    const result = parseFullBackup(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer game version/);
  });

  it("suggests a filename without disallowed characters", () => {
    const a = createInitialState();
    const json = serializeFullBackup([{ slot: 1, state: a }], null);
    const parsed = parseFullBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const name = suggestedFullBackupFileName(parsed.envelope);
    expect(name).not.toMatch(/[\/:]/);
    expect(name).toMatch(/\.json$/);
  });
});

describe("achievements.META_ACHIEVEMENTS predicates", () => {
  function withState(overrides: Partial<GameState>): GameState {
    return { ...createInitialState(), ...overrides } as GameState;
  }

  it("registers all six meta achievements in ALL_BASE_ACHIEVEMENTS", () => {
    const ids = new Set(ALL_BASE_ACHIEVEMENTS.map((a) => a.id));
    for (const id of ["streak_3", "streak_7", "streak_30", "weekly_first", "weekly_ten", "changelog_seen"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("does not unlock streak achievements at low values", () => {
    const state = withState({
      dailyStreak: { current: 2, longest: 2, lastClaimedDay: null, lastVisitedDay: null },
      unlockedAchievements: [],
    });
    const unlocked = checkAchievements(state);
    expect(unlocked).not.toContain("streak_3");
  });

  it("unlocks streak_3 when longest hits 3", () => {
    const state = withState({
      dailyStreak: { current: 3, longest: 3, lastClaimedDay: null, lastVisitedDay: null },
      unlockedAchievements: [],
    });
    const unlocked = checkAchievements(state);
    expect(unlocked).toContain("streak_3");
    expect(unlocked).not.toContain("streak_7");
  });

  it("unlocks streak_7 and streak_3 at longest 10", () => {
    const state = withState({
      dailyStreak: { current: 10, longest: 10, lastClaimedDay: null, lastVisitedDay: null },
      unlockedAchievements: [],
    });
    const unlocked = checkAchievements(state);
    expect(unlocked).toEqual(expect.arrayContaining(["streak_3", "streak_7"]));
    expect(unlocked).not.toContain("streak_30");
  });

  it("unlocks weekly_first on the first weekly clear", () => {
    const state = withState({ weeklyChallengesCompleted: 1, unlockedAchievements: [] });
    const unlocked = checkAchievements(state);
    expect(unlocked).toContain("weekly_first");
    expect(unlocked).not.toContain("weekly_ten");
  });

  it("unlocks weekly_ten only after ten clears", () => {
    const state = withState({ weeklyChallengesCompleted: 10, unlockedAchievements: [] });
    const unlocked = checkAchievements(state);
    expect(unlocked).toEqual(expect.arrayContaining(["weekly_first", "weekly_ten"]));
  });

  it("unlocks changelog_seen once lastSeenVersion is stamped", () => {
    const before = withState({ lastSeenVersion: undefined, unlockedAchievements: [] });
    expect(checkAchievements(before)).not.toContain("changelog_seen");
    const after = withState({ lastSeenVersion: "2.2.0", unlockedAchievements: [] });
    expect(checkAchievements(after)).toContain("changelog_seen");
  });
});
