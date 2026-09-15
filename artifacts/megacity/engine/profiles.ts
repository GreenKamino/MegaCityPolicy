import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CareerStats, GameState, PlayerAttributes, PlayerProfile, PlayerSkills, SaveSlotMeta } from "./types";
import { atomicWriteSlot, BACKUP_SUFFIX, TMP_SUFFIX, type SlotStorage } from "./saveLoad";
import { floorCap } from "./sanitizer";

// Default portrait id for legacy profiles missing one. Inlined here (rather
// than imported from utils/portraits) so engine code stays free of
// asset-bundler require() calls that crash Node-only test runs. Keep in sync
// with the first entry of PLAYER_PORTRAIT_GALLERY in utils/portraits.ts.
function getDefaultPlayerPortraitId(): string {
  return "player_male_1";
}
import {
  createDefaultPrestigeState,
  normalizePrestigeState,
  getStartingCreditsMultiplier,
  getStartingPopulationMultiplier,
  getFactionApprovalBonus,
  getStartingOfficerBonus,
  getExtraDiscoveredLocations,
  getResourceProductionMultiplier,
  getResearchSpeedMultiplier,
  getBusinessSpawnIntervalMultiplier,
  getChainExpansionChanceMultiplier,
  getAntiMonopolyCapDelta,
  getStartingBiosphereBonus,
  getStartingAquaponicsBonus,
  getStartingDefenseBonus,
  getEcologicalResearchSpeedMultiplier,
  getDruidEnvoyLoyaltyBonus,
} from "./prestige";
import { WORLD_LOCATIONS } from "./worldMap";

const PROFILES_INDEX_KEY = "@megacity_profiles_index";
const ACTIVE_PROFILE_KEY = "@megacity_active_profile";
export const PROFILE_PREFIX = "@megacity_profile_";
const PROFILE_SLOT_PREFIX = "_slot_";

export function profileKey(profileId: string): string {
  return `${PROFILE_PREFIX}${profileId}`;
}

export function profileSlotKey(profileId: string, slot: number): string {
  return `${PROFILE_PREFIX}${profileId}${PROFILE_SLOT_PREFIX}${slot}`;
}

export const MAX_PROFILES = 8;
export const MAX_SLOTS_PER_PROFILE = 6;

/**
 * Picks the slot a quick "NEW GAME" tap should use without showing the
 * slot manager. Returns the lowest-numbered slot whose meta explicitly says
 * `isEmpty === true`, or null when no safe auto-pick exists.
 *
 * Deliberately strict: a slot with NO meta entry (metas not yet hydrated
 * from storage) is NOT treated as empty — auto-starting a game there could
 * silently overwrite a real save. Callers must fall back to the slot picker
 * whenever this returns null.
 */
export function firstEmptyNewGameSlot(
  slotMetas: SaveSlotMeta[],
  totalSlots: number = MAX_SLOTS_PER_PROFILE,
): number | null {
  if (slotMetas.length === 0) return null;
  for (let slot = 1; slot <= totalSlots; slot++) {
    const meta = slotMetas.find((m) => m.slotId === slot);
    if (meta && meta.isEmpty === true) return slot;
  }
  return null;
}

function createDefaultCareerStats(): CareerStats {
  return {
    citiesRun: 0,
    totalPlayTime: 0,
    totalTicksAllCities: 0,
    totalPopulationGoverned: 0,
    totalCreditsEarned: 0,
    totalCriminalsSentenced: 0,
    totalRiotsQuelled: 0,
    totalContractsCompleted: 0,
    totalDecisions: 0,
    highestPopulation: 0,
    longestCityTicks: 0,
    totalOfficersAppointed: 0,
    totalFactionWars: 0,
    totalResearchCompleted: 0,
    totalBuildingsConstructed: 0,
    totalMissionsCompleted: 0,
  };
}

// Clamp the cross-game CareerStats tallies to the same MAX_RESOURCE
// ceiling the per-game counters use. Unlike the per-game lifetime
// counters (which `sanitizeState` clamps), CareerStats lives on
// PlayerProfile and accumulates across *every* city the player runs, so
// over a Steam-launch lifetime an unbounded `Math.max`/`+1` tally could
// drift toward Number.MAX_SAFE_INTEGER and render as scientific notation
// in the career/profile UI. Every field here is a monotonic lifetime
// tally or high-water mark, so flooring at 0 and capping at MAX_RESOURCE
// is safe — floorCap also strips NaN/Infinity from a corrupted blob.
export function sanitizeCareerStats(cs: CareerStats | undefined): CareerStats {
  const base = createDefaultCareerStats();
  if (!cs || typeof cs !== "object") return base;
  return {
    citiesRun: floorCap(cs.citiesRun),
    totalPlayTime: floorCap(cs.totalPlayTime),
    totalTicksAllCities: floorCap(cs.totalTicksAllCities),
    totalPopulationGoverned: floorCap(cs.totalPopulationGoverned),
    totalCreditsEarned: floorCap(cs.totalCreditsEarned),
    totalCriminalsSentenced: floorCap(cs.totalCriminalsSentenced),
    totalRiotsQuelled: floorCap(cs.totalRiotsQuelled),
    totalContractsCompleted: floorCap(cs.totalContractsCompleted),
    totalDecisions: floorCap(cs.totalDecisions),
    highestPopulation: floorCap(cs.highestPopulation),
    longestCityTicks: floorCap(cs.longestCityTicks),
    totalOfficersAppointed: floorCap(cs.totalOfficersAppointed),
    totalFactionWars: floorCap(cs.totalFactionWars),
    totalResearchCompleted: floorCap(cs.totalResearchCompleted),
    totalBuildingsConstructed: floorCap(cs.totalBuildingsConstructed),
    totalMissionsCompleted: floorCap(cs.totalMissionsCompleted),
  };
}

export function createDefaultProfile(
  name: string,
  age: number,
  sex: "male" | "female" | "other",
  portraitId?: string,
): PlayerProfile {
  const id = `prof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Default the portrait to the first male option if the caller did not
  // pick one — mirrors the createDefaultPlayer fallback so the
  // commander always has a face.
  const portrait = portraitId ?? (
    sex === "female" ? "player_female_1" :
    sex === "other" ? "player_other_1" :
    "player_male_1"
  );
  return {
    id,
    name,
    age,
    sex,
    portraitId: portrait,
    backstory: "",
    createdAt: Date.now(),
    lastPlayed: Date.now(),
    commanderLevel: 1,
    commanderXP: 0,
    commanderXPToNext: 100,
    attributePoints: 0,
    skillPoints: 0,
    attributes: { authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 },
    skills: {
      leadership: 1, tactics: 1, administration: 1, investigation: 0,
      intimidation: 0, diplomacy: 0, engineering: 0, medicine: 0,
      logistics: 0, surveillance: 0, propaganda: 0, blackOps: 0,
    },
    traits: [],
    decorations: [],
    augmentationSlots: [
      { id: "aug_head", label: "Cranial Implant", bodyRegion: "head", installed: null },
      { id: "aug_eyes", label: "Optic Enhancement", bodyRegion: "head", installed: null },
      { id: "aug_torso", label: "Torso Plating", bodyRegion: "torso", installed: null },
      { id: "aug_arms", label: "Arm Servos", bodyRegion: "arms", installed: null },
      { id: "aug_legs", label: "Leg Hydraulics", bodyRegion: "legs", installed: null },
      { id: "aug_spine", label: "Spinal Uplink", bodyRegion: "spine", installed: null },
    ],
    careerStats: createDefaultCareerStats(),
    unlockedAchievements: [],
    prestigeState: createDefaultPrestigeState(),
  };
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.4, level - 1));
}

export function syncProfileFromGameState(profile: PlayerProfile, state: GameState): PlayerProfile {
  const p = { ...profile };
  p.lastPlayed = Date.now();

  if (state.player.level > p.commanderLevel) {
    p.commanderLevel = state.player.level;
  }
  if (state.player.xp > p.commanderXP) {
    p.commanderXP = state.player.xp;
    p.commanderXPToNext = state.player.xpToNext;
  }

  const attrs = state.player.attributes;
  const pAttrs = { ...p.attributes };
  for (const k of Object.keys(pAttrs) as (keyof PlayerAttributes)[]) {
    if (attrs[k] > pAttrs[k]) pAttrs[k] = attrs[k];
  }
  p.attributes = pAttrs;

  const skills = state.player.skills;
  const pSkills = { ...p.skills };
  for (const k of Object.keys(pSkills) as (keyof PlayerSkills)[]) {
    if (skills[k] > pSkills[k]) pSkills[k] = skills[k];
  }
  p.skills = pSkills;

  // attributePoints/skillPoints are a live BALANCE (earned minus spent), not a
  // high-water stat. Mirror the exact current balance so spending persists.
  // Using Math.max here refunded spent points on new-game/rebirth because
  // injectProfileIntoGameState re-injects the stored (higher) balance.
  p.attributePoints = state.player.attributePoints;
  p.skillPoints = state.player.skillPoints;

  const newTraits = (state.player.traits ?? []).filter(t => !(p.traits ?? []).includes(t));
  if (newTraits.length > 0) p.traits = [...(p.traits ?? []), ...newTraits];

  const newDecs = (state.player.decorations ?? []).filter(d => !(p.decorations ?? []).includes(d));
  if (newDecs.length > 0) p.decorations = [...(p.decorations ?? []), ...newDecs];

  for (const slot of (state.player.augmentationSlots ?? [])) {
    if (slot.installed) {
      const profileSlot = (p.augmentationSlots ?? []).find(s => s.id === slot.id);
      if (profileSlot && !profileSlot.installed) {
        profileSlot.installed = slot.installed;
      }
    }
  }

  const cs = { ...p.careerStats };
  cs.totalTicksAllCities = Math.max(cs.totalTicksAllCities, state.totalTicks);
  cs.totalPopulationGoverned = Math.max(cs.totalPopulationGoverned, state.cityStats.population);
  if (state.cityStats.population > cs.highestPopulation) {
    cs.highestPopulation = state.cityStats.population;
  }
  if (state.totalTicks > cs.longestCityTicks) {
    cs.longestCityTicks = state.totalTicks;
  }
  cs.totalCriminalsSentenced = Math.max(cs.totalCriminalsSentenced, state.player.criminalsSentenced);
  cs.totalRiotsQuelled = Math.max(cs.totalRiotsQuelled, state.player.riotsQuelled);
  cs.totalContractsCompleted = Math.max(cs.totalContractsCompleted, state.player.contractsCompleted);
  cs.totalDecisions = Math.max(cs.totalDecisions, state.player.totalDecisions);
  cs.totalResearchCompleted = Math.max(cs.totalResearchCompleted, (state.unlockedTechnologies?.length ?? 0));
  cs.totalMissionsCompleted = Math.max(cs.totalMissionsCompleted, (state.militaryOverhaul?.completedMissions ?? 0));
  cs.totalPlayTime = Math.max(cs.totalPlayTime, state.playTime ?? 0);
  // Fold in the live cumulative gross-income counter. The current credit
  // balance is also a valid lower bound (you can never hold more than you've
  // earned), so we Math.max against it too — that keeps legacy saves predating
  // totalCreditsEarned (where the counter sits at 0) from under-reporting.
  cs.totalCreditsEarned = Math.max(
    cs.totalCreditsEarned,
    Math.floor(state.totalCreditsEarned ?? 0),
    Math.floor(state.resources?.credits ?? 0),
  );
  cs.totalOfficersAppointed = Math.max(
    cs.totalOfficersAppointed,
    (state.officers ?? []).filter(o => o.appointed).length,
  );
  cs.totalFactionWars = Math.max(cs.totalFactionWars, state.diplomacyAdvanced?.totalWars ?? 0);
  cs.totalBuildingsConstructed = Math.max(
    cs.totalBuildingsConstructed,
    Object.values(state.buildings ?? {}).reduce((sum, n) => sum + (n ?? 0), 0),
  );
  p.careerStats = sanitizeCareerStats(cs);

  const newAch = (state.unlockedAchievements ?? []).filter(a => !p.unlockedAchievements.includes(a));
  if (newAch.length > 0) p.unlockedAchievements = [...p.unlockedAchievements, ...newAch];

  return p;
}

export function injectProfileIntoGameState(profile: PlayerProfile, state: GameState): GameState {
  const prestige = normalizePrestigeState(profile.prestigeState);

  const creditsMult = getStartingCreditsMultiplier(prestige);
  const popMult = getStartingPopulationMultiplier(prestige);
  const factionBonus = getFactionApprovalBonus(prestige);
  const officerBonus = getStartingOfficerBonus(prestige);
  const extraLocs = getExtraDiscoveredLocations(prestige);
  const resourceMult = getResourceProductionMultiplier(prestige);
  const researchMult = getResearchSpeedMultiplier(prestige) * getEcologicalResearchSpeedMultiplier(prestige);
  const businessSpawnMult = getBusinessSpawnIntervalMultiplier(prestige);
  const chainExpansionMult = getChainExpansionChanceMultiplier(prestige);
  const antiMonopolyDelta = getAntiMonopolyCapDelta(prestige);

  const startingBiosphereBonus = getStartingBiosphereBonus(prestige);
  const startingAquaponics = getStartingAquaponicsBonus(prestige);
  const startingDefense = getStartingDefenseBonus(prestige);
  const druidLoyaltyBonus = getDruidEnvoyLoyaltyBonus(prestige);

  let result: GameState = {
    ...state,
    player: {
      ...state.player,
      name: profile.name,
      age: profile.age,
      sex: profile.sex,
      // For legacy profiles without portraitId, fall back to the default
      // portrait. Portraits are no longer sex-filtered, so a single default
      // is fine; the player can change it any time from the Character screen.
      portraitId: profile.portraitId ?? getDefaultPlayerPortraitId(),
      // Carry the profile's backstory into the live game state so the
      // character screen (which reads player.backstory, not the active
      // profile) shows what the player wrote at profile-create time.
      // Falls back to the default seeded backstory if the profile has
      // an empty string — preserves the legacy "Academy" blurb for
      // pre-existing profiles that never had a backstory field surfaced.
      backstory: profile.backstory && profile.backstory.length > 0 ? profile.backstory : state.player.backstory,
      level: profile.commanderLevel,
      xp: profile.commanderXP,
      xpToNext: profile.commanderXPToNext,
      attributePoints: profile.attributePoints,
      skillPoints: profile.skillPoints,
      attributes: { ...profile.attributes },
      skills: { ...profile.skills },
      traits: [...(profile.traits ?? [])],
      decorations: [...(profile.decorations ?? [])],
      augmentationSlots: (profile.augmentationSlots ?? []).map(s => ({ ...s })),
    },
    resources: {
      ...state.resources,
      credits: Math.round(state.resources.credits * creditsMult),
    },
    cityStats: {
      ...state.cityStats,
      population: Math.round(state.cityStats.population * popMult),
      biosphere: Math.min(100, (state.cityStats.biosphere ?? 0) + startingBiosphereBonus),
      defenseRating: (state.cityStats.defenseRating ?? 0) + startingDefense,
    },
    buildings: startingAquaponics > 0
      ? { ...state.buildings, aquaponicsMegaFacilities: ((state.buildings as Record<string, number>).aquaponicsMegaFacilities ?? 0) + startingAquaponics } as typeof state.buildings
      : state.buildings,
    prestigeResourceMult: resourceMult,
    prestigeResearchMult: researchMult,
    prestigeBusinessSpawnMult: businessSpawnMult,
    prestigeChainExpansionMult: chainExpansionMult,
    prestigeAntiMonopolyCapDelta: antiMonopolyDelta,
  };

  if (factionBonus > 0 || druidLoyaltyBonus > 0) {
    result = {
      ...result,
      factions: result.factions.map(f => {
        let loyalty = (f.loyalty ?? 0) + factionBonus;
        if (druidLoyaltyBonus > 0 && (f.ecologyStance === "conservationist" || f.ecologyStance === "druid")) {
          loyalty += druidLoyaltyBonus;
        }
        return { ...f, loyalty: Math.min(100, loyalty) };
      }),
    };
  }

  if (officerBonus > 0) {
    const unappointed = result.officers.filter(o => !o.appointed);
    const toAppoint = unappointed.slice(0, officerBonus);
    if (toAppoint.length > 0) {
      const appointIds = new Set(toAppoint.map(o => o.id));
      result = {
        ...result,
        officers: result.officers.map(o =>
          appointIds.has(o.id) ? { ...o, appointed: true } : o
        ),
      };
    }
  }

  if (extraLocs > 0) {
    const currentDiscovered = new Set(result.discoveredLocationIds ?? []);
    const undiscovered = WORLD_LOCATIONS.filter(
      l => !l.discovered && !currentDiscovered.has(l.id) && l.type !== "player_city"
    );
    const shuffled = undiscovered.sort(() => Math.random() - 0.5);
    const toReveal = shuffled.slice(0, extraLocs).map(l => l.id);
    result = {
      ...result,
      discoveredLocationIds: [...(result.discoveredLocationIds ?? []), ...toReveal],
    };
  }

  return result;
}

export async function loadProfileIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveProfileIndex(ids: string[]): Promise<void> {
  // Torn-write protection: stage to a temp key first, then commit.
  // A power-loss between bytes can never leave the index key holding
  // a half-written list of profile ids that would orphan saves.
  await atomicWriteSlot(
    AsyncStorage as unknown as SlotStorage,
    PROFILES_INDEX_KEY,
    JSON.stringify(ids),
  );
}

export async function loadProfile(id: string): Promise<PlayerProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(profileKey(id));
    if (!raw) return null;
    const profile = JSON.parse(raw) as PlayerProfile;
    // Clamp the cross-game career tallies on load so a save written
    // before these caps existed (or a corrupted blob) can never surface
    // scientific-notation gibberish in the career/profile UI.
    profile.careerStats = sanitizeCareerStats(profile.careerStats);
    return profile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: PlayerProfile): Promise<void> {
  // Torn-write protection: stage to a temp key first, then commit. A
  // corrupted profile blob would orphan every slot under it, which is
  // worse than losing a single slot — so we route through the same
  // atomic temp-key + swap helper that slot writes use.
  await atomicWriteSlot(
    AsyncStorage as unknown as SlotStorage,
    profileKey(profile.id),
    JSON.stringify(profile),
  );
}

export async function deleteProfile(id: string): Promise<void> {
  // Remove every storage key this commander could have produced — not just
  // the primary slot blobs. atomicWriteSlot rotates the previous copy into a
  // `_backup` key and stages via a `.tmp` key on EVERY write (slots AND the
  // profile record itself), so deleting only the primaries silently orphans
  // up to 2 extra blobs per slot plus 2 for the profile blob. Orphans are
  // invisible to the UI but bloat AsyncStorage forever, and a future
  // commander who collides with a recycled id would inherit stale backups.
  for (let i = 1; i <= MAX_SLOTS_PER_PROFILE; i++) {
    const slotKey = profileSlotKey(id, i);
    await AsyncStorage.removeItem(slotKey);
    await AsyncStorage.removeItem(slotKey + BACKUP_SUFFIX);
    await AsyncStorage.removeItem(slotKey + TMP_SUFFIX);
  }
  const pKey = profileKey(id);
  await AsyncStorage.removeItem(pKey);
  await AsyncStorage.removeItem(pKey + BACKUP_SUFFIX);
  await AsyncStorage.removeItem(pKey + TMP_SUFFIX);
  const index = await loadProfileIndex();
  await saveProfileIndex(index.filter(pid => pid !== id));
}

export async function loadActiveProfileId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
}

export async function saveActiveProfileId(id: string): Promise<void> {
  // Torn-write protection: stage to a temp key first, then commit.
  // Losing the active-profile pointer mid-write would silently boot
  // the player into the wrong profile (or none) on next launch.
  await atomicWriteSlot(
    AsyncStorage as unknown as SlotStorage,
    ACTIVE_PROFILE_KEY,
    id,
  );
}

/**
 * Repair the profile index: drop duplicate ids and "ghost" entries whose
 * profile record is missing or unreadable. Ghosts are how commander creation
 * silently broke — the index said 8 profiles existed while the roster showed
 * fewer, so the create button was enabled but creation threw at the cap.
 * Rewrites the index only when something was actually removed.
 * Returns the cleaned id list, which is the authoritative profile count.
 */
export async function pruneProfileIndex(): Promise<string[]> {
  const index = await loadProfileIndex();
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of index) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    const profile = await loadProfile(id);
    if (profile) kept.push(id);
  }
  if (kept.length !== index.length) {
    await saveProfileIndex(kept);
  }
  return kept;
}

export async function loadAllProfiles(): Promise<PlayerProfile[]> {
  const ids = await loadProfileIndex();
  const profiles: PlayerProfile[] = [];
  for (const id of ids) {
    const p = await loadProfile(id);
    if (p) profiles.push(p);
  }
  return profiles;
}

/**
 * Read-only, strict profile hydration for the boot gate.
 *
 * The regular loaders intentionally recover from corrupt records by returning
 * an empty list/null. That is appropriate for non-critical roster refreshes,
 * but startup must distinguish "there are no commanders" from "commander data
 * could not be restored" so it never offers an apparently safe empty menu.
 */
export async function loadAllProfilesStrict(): Promise<PlayerProfile[]> {
  const indexRaw = await AsyncStorage.getItem(PROFILES_INDEX_KEY);
  if (!indexRaw) return [];
  const ids = JSON.parse(indexRaw) as unknown;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) {
    throw new Error("Malformed commander profile index");
  }

  const profiles: PlayerProfile[] = [];
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(profileKey(id));
    if (!raw) throw new Error(`Missing commander profile record: ${id}`);
    const profile = JSON.parse(raw) as PlayerProfile;
    if (!profile || typeof profile !== "object" || profile.id !== id) {
      throw new Error(`Malformed commander profile record: ${id}`);
    }
    profile.careerStats = sanitizeCareerStats(profile.careerStats);
    profiles.push(profile);
  }
  return profiles;
}

