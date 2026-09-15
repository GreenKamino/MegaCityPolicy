import type {
  GameState,
  NamedCharacter,
  CharacterRole,
  CharacterStatus,
  GameMessage,
} from "./types";
import { generateCharacterBio, hasCharacterTraitFlavor } from "./characterBios";

const HISTORY_CAP = 16;
const MAX_ACTIVE_PER_ROLE = 6;
const STALE_YEARS = 8;
// Cap on inactive (missing/dead/jailed/exiled) characters retained in
// state. Active characters are bounded by MAX_ACTIVE_PER_ROLE × roles,
// but the cull pass only flips status — it never removes — so missing
// characters used to accumulate forever. We keep the most recently
// relevant inactive characters (higher lastSeenYear, then higher
// notoriety) and drop the rest.
//
// Cap enforcement runs at *spawn time* (via enforceCharacterCaps inside
// spawnNamedCharacter), not just at year-rollover. A previous version
// only enforced caps inside tickNamedCharacters, which is gated to
// `gameDate.year !== prevYear`. With 15-min ticks, an in-game year is
// ~35,040 ticks, so most playthroughs would go a full session without
// the cap firing — saveSizeBreakdown showed namedCharacters as the
// worst grower (Δ ratio 0.65 over 4k ticks). Spawn-time enforcement
// makes the bound an invariant: array length ≤ active-cap + inactive-
// cap = (MAX_ACTIVE_PER_ROLE × roleCount) + MAX_INACTIVE_RETAINED.
const MAX_INACTIVE_RETAINED = 60;

// ──────────────────────────────────────────────────────────────────────
// Named-character trait → sim effect table.
//
// These multipliers are applied to per-tick stat *deltas* (not to the
// stats themselves) and only when the delta is moving in the direction
// the trait amplifies. That keeps the trait system from spontaneously
// flipping a stat from improving to worsening (or vice versa) and keeps
// every per-NPC effect inside the ±10–20% range called out by the
// design brief (task #52).
//
// District-attached NPCs (those with a non-null `districtId`) influence
// per-district crime / unrest / gang-influence deltas.
// Faction-attached NPCs (those with a non-null `factionId`) influence
// per-faction loyalty deltas.
//
// Aggregate multipliers are clamped to ±35% so a swarm of trait-bearing
// NPCs in one district can't run away with the sim.
// ──────────────────────────────────────────────────────────────────────
type DistrictTraitEffect = Partial<{
  crimeMult: number;
  unrestMult: number;
  gangInfluenceMult: number;
}>;

type FactionTraitEffect = Partial<{
  loyaltyMult: number;
  // Task #55: trait nudges to faction *threat* growth. Aggressive /
  // ruthless lieutenants accelerate threat climbs; reformist /
  // compassionate figureheads dampen them.
  threatMult: number;
}>;

// Task #55: city-wide trait nudges sourced from every active NPC,
// regardless of district or faction anchor. These tune system-level
// risks like contract delivery delays where individual NPCs influence
// city operations rather than a single district or faction.
type CityTraitEffect = Partial<{
  contractDelayMult: number;
  // Task #58: city-wide trait nudges to event spawn frequency. Paranoid /
  // talkative / charismatic figures inflate the cadence of the
  // notable/flashpoint/rumor/market beats; quiet / stoic figures dampen
  // it. Per-trait clamp keeps any single NPC inside ±20% influence and
  // the global ±35% clamp prevents a stack of NPCs flipping the gate
  // from 0 to 1 (or vice versa).
  eventSpawnMult: number;
}>;

export const NAMED_CHARACTER_TRAIT_EFFECTS: {
  district: Record<string, DistrictTraitEffect>;
  faction: Record<string, FactionTraitEffect>;
  city: Record<string, CityTraitEffect>;
} = {
  district: {
    // Ruthless lieutenants raise local crime faster.
    ruthless: { crimeMult: 1.15 },
    // Brutal enforcers expand a gang's grip on the block.
    brutal: { gangInfluenceMult: 1.15 },
    // Charismatic agitators draw bigger crowds and amplify unrest swings.
    charismatic: { unrestMult: 1.15 },
    // Compassionate organizers calm tensions, dampening unrest growth.
    compassionate: { unrestMult: 0.85 },
    // Greedy tycoons squeeze the block — racketeering and vice rise.
    greedy: { crimeMult: 1.15 },
    // Corrupt fixers funnel rackets through the district's offices.
    corrupt: { crimeMult: 1.15 },
    // Manipulative agitators stoke grievances they can ride.
    manipulative: { unrestMult: 1.10 },
    // Paranoid informants leak fear through the streets they work.
    paranoid: { unrestMult: 1.10 },
    // Aggressive lieutenants push gang territory outward.
    aggressive: { gangInfluenceMult: 1.10 },
    // Vengeful figures keep feuds simmering, driving up local crime.
    vengeful: { crimeMult: 1.10 },
    // Rebellious figures keep the block primed to flare up.
    rebellious: { unrestMult: 1.15 },
    // Authority-hating preachers and agitators amplify civic anger.
    authority_hating: { unrestMult: 1.15 },
    // Community-minded organizers stitch the block back together.
    community_minded: { unrestMult: 0.85 },
    // Ethical figures shame the worst rackets, slowing crime growth.
    ethical: { crimeMult: 0.90 },
    // Pious preachers offer an outlet other than rioting.
    pious: { unrestMult: 0.90 },
    // Reformist organizers channel anger into legitimate process.
    reformist: { unrestMult: 0.90 },
    // ── task #56: cover the remaining cosmetic traits ──────────────────
    // Cunning operators slip rackets past the bureaus.
    cunning: { crimeMult: 1.10 },
    // Opportunistic crews pounce on every opening, pushing crime up.
    opportunistic: { crimeMult: 1.10 },
    // Reckless agitators light fires they can't control.
    reckless: { unrestMult: 1.10 },
    // Calculating lieutenants methodically extend gang territory.
    calculating: { gangInfluenceMult: 1.10 },
    // Cautious operators stay small to avoid scrutiny — slows crime growth.
    cautious: { crimeMult: 0.90 },
    // Stoic figures keep tempers level on the block.
    stoic: { unrestMult: 0.90 },
    // Rule-breakers normalize lawlessness, accelerating local crime.
    rule_breaking: { crimeMult: 1.10 },
    // Friendly community fixtures defuse arguments before they spread.
    friendly: { unrestMult: 0.85 },
    // Suspicious informants and beat-fixers seed mistrust through the streets.
    suspicious: { unrestMult: 1.10 },
    // Resourceful lieutenants improvise expansion — gang turf creeps wider.
    resourceful: { gangInfluenceMult: 1.10 },
    // ── task #57: cover the final cosmetic-only traits ─────────────────
    // Emotional figures react volatilely on the block, amplifying swings.
    emotional: { unrestMult: 1.10 },
    // Talkative organizers spread rumors and grievances door to door.
    talkative: { unrestMult: 1.10 },
    // Quiet operators keep their heads down — fewer flare-ups around them.
    quiet: { unrestMult: 0.90 },
    // Thrill-seekers pull crews into bigger, riskier scores.
    thrill_seeking: { crimeMult: 1.10 },
    // Intelligent investigators / organizers spot rackets early.
    intelligent: { crimeMult: 0.90 },
    // Creative figures channel street anger into art and projects.
    creative: { unrestMult: 0.90 },
    // Optimistic public figures lift block morale, easing resentment.
    optimistic: { unrestMult: 0.85 },
    // Curious journalists and watchers nose into schemes before they grow.
    curious: { crimeMult: 0.90 },
  },
  faction: {
    // Loyal NPCs reinforce upward loyalty trends for their faction.
    loyal: { loyaltyMult: 1.20 },
    // Manipulative spin-masters consolidate the faction around them.
    manipulative: { loyaltyMult: 1.10 },
    // Ambitious lieutenants drive the faction forward, pulling rank-and-file along.
    ambitious: { loyaltyMult: 1.10 },
    // Vengeful figures rally the faithful against shared enemies.
    // Task #55: vengeance also drives faction threat upward — feuds escalate.
    vengeful: { loyaltyMult: 1.10, threatMult: 1.15 },
    // Community-minded leaders bind faction members tighter than orders ever could.
    community_minded: { loyaltyMult: 1.15 },
    // Corrupt insiders rot the trust loyalty depends on.
    corrupt: { loyaltyMult: 0.85 },
    // Paranoid leaders breed suspicion that hollows out loyalty gains.
    paranoid: { loyaltyMult: 0.85 },
    // Selfish power-brokers fracture the faction around their own interests.
    selfish: { loyaltyMult: 0.90 },
    // ── task #56: cover the remaining cosmetic traits ──────────────────
    // Patriotic leaders invoke shared identity to lock in loyalty.
    patriotic: { loyaltyMult: 1.15 },
    // Idealistic figures inspire belief in the faction's cause.
    idealistic: { loyaltyMult: 1.10 },
    // Cynical leaders hollow out the belief loyalty depends on.
    cynical: { loyaltyMult: 0.90 },
    // Distrustful figures alienate the rank-and-file they should be steering.
    distrustful: { loyaltyMult: 0.85 },
    // Independent operators resist faction discipline; loyalty bleeds.
    independent: { loyaltyMult: 0.90 },
    // ── task #57: cover the final cosmetic-only traits ─────────────────
    // Competitive lieutenants push the faction onto the warpath chasing rivals.
    competitive: { threatMult: 1.10 },
    // ── task #55: faction threat trait nudges ───────────────────────────
    // Aggressive lieutenants push the faction onto the warpath faster.
    aggressive: { threatMult: 1.15 },
    // Ruthless figureheads escalate confrontation rather than de-escalate it.
    ruthless: { threatMult: 1.15 },
    // Reformist leaders steer factional energy into legitimate channels.
    reformist: { threatMult: 0.85 },
    // Compassionate figureheads pull the faction back from open conflict.
    compassionate: { threatMult: 0.85 },
  },
  city: {
    // ── task #55: city-wide contract delivery trait nudges ──────────────
    // Corrupt power-brokers in the city — anywhere — drag down contract
    // delivery as kickbacks and fixers gum up the works.
    corrupt: { contractDelayMult: 1.15 },
    // Greedy tycoons squeeze suppliers and starve contracts of materials.
    greedy: { contractDelayMult: 1.10 },
    // Cunning operators reroute contracts through their own networks.
    cunning: { contractDelayMult: 1.10 },
    // Manipulative power-brokers stall contracts they don't directly profit from.
    // Task #58: they also engineer flashpoints they can ride, lifting spawn cadence.
    manipulative: { contractDelayMult: 1.10, eventSpawnMult: 1.10 },
    // Ethical figures shame the worst delays — projects move on schedule.
    ethical: { contractDelayMult: 0.90 },
    // Industrious organizers keep crews on task, shaving delays.
    industrious: { contractDelayMult: 0.90 },
    // ── task #58: city-wide event spawn rate trait nudges ───────────────
    // Paranoid figures leak suspicion through every channel — the news desk
    // picks up more notable/flashpoint/rumor beats around them.
    paranoid: { eventSpawnMult: 1.15 },
    // Talkative organizers spread rumors door to door, generating chatter.
    talkative: { eventSpawnMult: 1.15 },
    // Charismatic figures draw the cameras — more media beats land.
    charismatic: { eventSpawnMult: 1.10 },
    // Quiet operators keep their heads down — fewer flares for reporters.
    quiet: { eventSpawnMult: 0.90 },
    // Stoic figures don't generate news drama on their own.
    stoic: { eventSpawnMult: 0.90 },
  },
};

const TRAIT_MULT_FLOOR = 0.65;
const TRAIT_MULT_CEIL = 1.35;

function clampMult(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return 1;
  return Math.max(TRAIT_MULT_FLOOR, Math.min(TRAIT_MULT_CEIL, m));
}

export type DistrictTraitMultipliers = {
  crimeMult: number;
  unrestMult: number;
  gangInfluenceMult: number;
};

export type FactionTraitMultipliers = {
  loyaltyMult: number;
  threatMult: number;
};

export type CityTraitMultipliers = {
  contractDelayMult: number;
  // Task #58: scales the spawn-gate threshold inside the four NPC news
  // beats (notable / flashpoint / rumor / market). >1 = more frequent,
  // <1 = less frequent. Clamped to ±35% in `clampMult`.
  eventSpawnMult: number;
};

const IDENTITY_DISTRICT_MULT: DistrictTraitMultipliers = {
  crimeMult: 1,
  unrestMult: 1,
  gangInfluenceMult: 1,
};

const IDENTITY_FACTION_MULT: FactionTraitMultipliers = {
  loyaltyMult: 1,
  threatMult: 1,
};

const IDENTITY_CITY_MULT: CityTraitMultipliers = {
  contractDelayMult: 1,
  eventSpawnMult: 1,
};

/**
 * Aggregate trait-driven multipliers for a single district from every
 * active named character whose `districtId` matches. Returns an
 * identity-multiplier object (all 1s) when nothing applies, so callers
 * can multiply unconditionally.
 */
export function computeDistrictTraitMultipliers(
  state: GameState,
  districtId: string,
): DistrictTraitMultipliers {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  if (list.length === 0) return IDENTITY_DISTRICT_MULT;
  let crimeMult = 1;
  let unrestMult = 1;
  let gangInfluenceMult = 1;
  for (const c of list) {
    if (c.status !== "active") continue;
    if (c.districtId !== districtId) continue;
    const traits = Array.isArray(c.traits) ? c.traits : [];
    for (const t of traits) {
      const fx = NAMED_CHARACTER_TRAIT_EFFECTS.district[t];
      if (!fx) continue;
      if (fx.crimeMult !== undefined) crimeMult *= fx.crimeMult;
      if (fx.unrestMult !== undefined) unrestMult *= fx.unrestMult;
      if (fx.gangInfluenceMult !== undefined) gangInfluenceMult *= fx.gangInfluenceMult;
    }
  }
  return {
    crimeMult: clampMult(crimeMult),
    unrestMult: clampMult(unrestMult),
    gangInfluenceMult: clampMult(gangInfluenceMult),
  };
}

/**
 * Aggregate trait-driven multipliers for a single faction from every
 * active named character whose `factionId` matches. Returns an
 * identity-multiplier object (all 1s) when nothing applies.
 */
export function computeFactionTraitMultipliers(
  state: GameState,
  factionId: string,
): FactionTraitMultipliers {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  if (list.length === 0) return IDENTITY_FACTION_MULT;
  let loyaltyMult = 1;
  let threatMult = 1;
  for (const c of list) {
    if (c.status !== "active") continue;
    if (c.factionId !== factionId) continue;
    const traits = Array.isArray(c.traits) ? c.traits : [];
    for (const t of traits) {
      const fx = NAMED_CHARACTER_TRAIT_EFFECTS.faction[t];
      if (!fx) continue;
      if (fx.loyaltyMult !== undefined) loyaltyMult *= fx.loyaltyMult;
      if (fx.threatMult !== undefined) threatMult *= fx.threatMult;
    }
  }
  return {
    loyaltyMult: clampMult(loyaltyMult),
    threatMult: clampMult(threatMult),
  };
}

/**
 * Aggregate trait-driven city-wide multipliers from every active named
 * character, regardless of district or faction anchor. Used for sim
 * dimensions where individual NPCs influence city-level systems
 * (contract delivery, etc.) rather than a single district or faction.
 */
export function computeCityTraitMultipliers(
  state: GameState,
): CityTraitMultipliers {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  if (list.length === 0) return IDENTITY_CITY_MULT;
  let contractDelayMult = 1;
  let eventSpawnMult = 1;
  for (const c of list) {
    if (c.status !== "active") continue;
    const traits = Array.isArray(c.traits) ? c.traits : [];
    for (const t of traits) {
      const fx = NAMED_CHARACTER_TRAIT_EFFECTS.city[t];
      if (!fx) continue;
      if (fx.contractDelayMult !== undefined) contractDelayMult *= fx.contractDelayMult;
      if (fx.eventSpawnMult !== undefined) eventSpawnMult *= fx.eventSpawnMult;
    }
  }
  return {
    contractDelayMult: clampMult(contractDelayMult),
    eventSpawnMult: clampMult(eventSpawnMult),
  };
}

/**
 * Per-trait contribution from a single active named character to a
 * district's crime / unrest / gang-influence multipliers. Used by
 * the districts UI (task #53) so the player can see which named
 * figures are bending a district's stats.
 */
export type DistrictTraitContribution = {
  characterId: string;
  characterName: string;
  trait: string;
  crimeMult?: number;
  unrestMult?: number;
  gangInfluenceMult?: number;
};

/**
 * Per-trait contribution from a single active named character to a
 * faction's loyalty / threat multipliers. Used by the faction UI
 * (task #59) to show the player which named figures are nudging a
 * faction's stats and by how much.
 */
export type FactionTraitContribution = {
  characterId: string;
  characterName: string;
  trait: string;
  loyaltyMult?: number;
  threatMult?: number;
};

/**
 * Per-trait contribution from a single active named character to
 * city-wide multipliers (currently contract delivery delay). Used by
 * the contracts UI (task #59) to surface which named figures are
 * shaping city-level systems.
 */
export type CityTraitContribution = {
  characterId: string;
  characterName: string;
  trait: string;
  contractDelayMult: number;
};

/**
 * Enumerate every (active named character × trait) pair whose trait
 * has a registered faction-level effect for the given faction. Returns
 * an empty array when no characters are anchored to the faction or
 * when none of their traits map to faction effects.
 */
export function listFactionTraitContributions(
  state: GameState,
  factionId: string,
): FactionTraitContribution[] {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  if (list.length === 0) return [];
  const out: FactionTraitContribution[] = [];
  for (const c of list) {
    if (c.status !== "active") continue;
    if (c.factionId !== factionId) continue;
    const traits = Array.isArray(c.traits) ? c.traits : [];
    for (const t of traits) {
      const fx = NAMED_CHARACTER_TRAIT_EFFECTS.faction[t];
      if (!fx) continue;
      if (fx.loyaltyMult === undefined && fx.threatMult === undefined) continue;
      out.push({
        characterId: c.id,
        characterName: c.name,
        trait: t,
        loyaltyMult: fx.loyaltyMult,
        threatMult: fx.threatMult,
      });
    }
  }
  return out;
}

/**
 * Enumerate every (active named character × trait) pair whose trait
 * has a registered district-level effect for the given district.
 * Returns an empty array when no characters are anchored to the
 * district or when none of their traits map to district effects.
 * (Task #53 — district detail "Influenced By" panel.)
 */
export function listDistrictTraitContributions(
  state: GameState,
  districtId: string,
): DistrictTraitContribution[] {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  if (list.length === 0) return [];
  const out: DistrictTraitContribution[] = [];
  for (const c of list) {
    if (c.status !== "active") continue;
    if (c.districtId !== districtId) continue;
    const traits = Array.isArray(c.traits) ? c.traits : [];
    for (const t of traits) {
      const fx = NAMED_CHARACTER_TRAIT_EFFECTS.district[t];
      if (!fx) continue;
      if (
        fx.crimeMult === undefined &&
        fx.unrestMult === undefined &&
        fx.gangInfluenceMult === undefined
      ) {
        continue;
      }
      out.push({
        characterId: c.id,
        characterName: c.name,
        trait: t,
        crimeMult: fx.crimeMult,
        unrestMult: fx.unrestMult,
        gangInfluenceMult: fx.gangInfluenceMult,
      });
    }
  }
  return out;
}

/**
 * Enumerate every (active named character × trait) pair whose trait
 * has a registered city-level effect. Returns an empty array when no
 * active characters carry city-affecting traits.
 */
export function listCityTraitContributions(
  state: GameState,
): CityTraitContribution[] {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  if (list.length === 0) return [];
  const out: CityTraitContribution[] = [];
  for (const c of list) {
    if (c.status !== "active") continue;
    const traits = Array.isArray(c.traits) ? c.traits : [];
    for (const t of traits) {
      const fx = NAMED_CHARACTER_TRAIT_EFFECTS.city[t];
      if (!fx) continue;
      if (fx.contractDelayMult === undefined) continue;
      out.push({
        characterId: c.id,
        characterName: c.name,
        trait: t,
        contractDelayMult: fx.contractDelayMult,
      });
    }
  }
  return out;
}

/**
 * Apply a trait multiplier to a delta, but only when the delta is
 * moving in the direction the multiplier amplifies/dampens. For
 * amplifying mults (>1) we only scale positive deltas; for dampening
 * mults (<1) we also only scale positive deltas — both shape how
 * "fast" a worsening stat worsens. Negative deltas (improvement) are
 * passed through unchanged so a single trait can never flip the sign
 * of a stat tick.
 */
export function applyTraitMultiplierToDelta(delta: number, mult: number): number {
  if (delta <= 0 || mult === 1) return delta;
  return delta * mult;
}

// Role-aware trait pools used when spawn/event code needs to attach
// personality traits to an NPC. These mix:
//   - the original NPC archetype trait ids (brutal, cunning, pious, …)
//   - ids drawn from CITIZEN_TRAITS (engine/traits.ts)
// Both are guaranteed to resolve to flavor sentences via
// CHARACTER_TRAIT_FLAVOR (see characterBios.ts), so generated bios will
// surface trait-driven prose for any pick.
export const ROLE_TRAIT_POOL: Record<CharacterRole, readonly string[]> = {
  gang_lieutenant: [
    "brutal", "ruthless", "aggressive", "rule_breaking", "thrill_seeking",
    "calculating", "cunning", "vengeful", "paranoid", "selfish",
    "opportunistic", "competitive", "reckless", "ambitious",
  ],
  journalist: [
    "curious", "intelligent", "ethical", "idealistic", "talkative",
    "cynical", "independent", "rebellious", "resourceful", "ambitious",
    "calculating", "reformist",
  ],
  tycoon: [
    "greedy", "ambitious", "ruthless", "calculating", "manipulative",
    "corrupt", "opportunistic", "competitive", "selfish", "industrious",
    "intelligent", "charismatic",
  ],
  agitator: [
    "rebellious", "idealistic", "authority_hating", "charismatic",
    "emotional", "reformist", "community_minded", "compassionate",
    "ethical", "stoic", "vengeful",
  ],
  celebrity: [
    "charismatic", "ambitious", "talkative", "competitive", "manipulative",
    "optimistic", "emotional", "selfish", "creative", "friendly",
    "opportunistic", "vengeful",
  ],
  informant: [
    "cunning", "paranoid", "manipulative", "selfish", "opportunistic",
    "calculating", "quiet", "suspicious", "greedy", "cautious",
    "distrustful",
  ],
  fugitive: [
    "paranoid", "cautious", "cunning", "stoic", "resourceful",
    "vengeful", "rule_breaking", "ruthless", "reckless", "independent",
    "distrustful", "calculating",
  ],
  preacher: [
    "pious", "idealistic", "charismatic", "stoic", "compassionate",
    "patriotic", "ethical", "manipulative", "vengeful", "authority_hating",
    "community_minded", "talkative",
  ],
  union_boss: [
    "loyal", "stoic", "charismatic", "community_minded", "reformist",
    "calculating", "ambitious", "ethical", "competitive", "industrious",
    "rule_breaking", "rebellious",
  ],
};

const ROLE_LABELS: Record<CharacterRole, string> = {
  gang_lieutenant: "Gang Lieutenant",
  journalist: "Journalist",
  tycoon: "Industrial Tycoon",
  agitator: "Street Agitator",
  celebrity: "Public Figure",
  informant: "Informant",
  fugitive: "Fugitive",
  preacher: "Underground Preacher",
  union_boss: "Union Boss",
};

export function getCharacterRoleLabel(role: CharacterRole): string {
  return ROLE_LABELS[role] ?? role;
}

const ROLE_FIRST: Record<CharacterRole, string[]> = {
  gang_lieutenant: ["Razor", "Hex", "Vyn", "Spool", "Scrap", "Dax", "Tova", "Quill", "Mara", "Ash"],
  journalist: ["Inez", "Yusra", "Cass", "Talen", "Rin", "Ola", "Halia", "Idris", "Lior", "Sasha"],
  tycoon: ["Marcus", "Elara", "Joran", "Vex", "Renko", "Tarsus", "Cyril", "Veska", "Brent", "Astra"],
  agitator: ["Eshe", "Bram", "Nia", "Kade", "Sable", "Tov", "Halia", "Renko", "Mira", "Quan"],
  celebrity: ["Lyra", "Cyan", "Solas", "Maven", "Aria", "Echo", "Brio", "Vela", "Tessa", "Orin"],
  informant: ["Whisper", "Slip", "Crow", "Echo", "Tally", "Wick", "Mote", "Pell", "Snow", "Drift"],
  fugitive: ["Ghost", "Strix", "Ronin", "Vesp", "Cinder", "Shade", "Vex", "Mar", "Knell", "Brand"],
  preacher: ["Father", "Sister", "Brother", "Elder", "Mother", "Deacon", "Saint", "Prophet", "Vicar", "Pilgrim"],
  union_boss: ["Tomas", "Ines", "Greta", "Boris", "Lev", "Marta", "Yuri", "Stela", "Vad", "Ola"],
};

const LAST_NAMES = [
  "Drennan", "Voss", "Marek", "Calder", "Okafor", "Strazza", "Halberd", "Pell", "Roan", "Vance",
  "Solano", "Tarkov", "Wynn", "Brand", "Greer", "Hadj", "Ishmael", "Moreau", "Quan", "Velez",
  "Korbel", "Asare", "Petrov", "Linde", "Goss", "Aiyar", "Marin", "Devereaux", "Soto", "Yamada",
  "Brennan", "Castellanos", "Dorvil", "Eskenazi", "Fenwick", "Gallagher", "Hinode",
  "Ivashov", "Jelani", "Kaminsky", "Lestrange", "Maximoff", "Nakashima",
  "Ortuño", "Pradhan", "Quintero", "Rasmussen", "Suzuki", "Tobiassen",
  "Ulmer", "Veracruz", "Whitten", "Yashin", "Zoric",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick `count` distinct, role-appropriate trait ids from ROLE_TRAIT_POOL.
 * Falls back to a generic pool for unknown roles. Filters out any ids that
 * lack flavor coverage so generated bios always render with prose.
 */
export function pickRoleAwareTraits(role: CharacterRole, count: number = 2): string[] {
  if (count <= 0) return [];
  const pool = (ROLE_TRAIT_POOL[role] ?? ROLE_TRAIT_POOL.celebrity).filter(hasCharacterTraitFlavor);
  if (pool.length === 0) return [];
  const want = Math.min(count, pool.length);
  const chosen: string[] = [];
  const used = new Set<number>();
  let safety = 0;
  while (chosen.length < want && safety++ < pool.length * 4) {
    const idx = Math.floor(Math.random() * pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    chosen.push(pool[idx]!);
  }
  return chosen;
}

/**
 * Backfill 1–2 role-aware traits onto an existing NPC who has none, and
 * regenerate their bio so trait-driven flavor surfaces in the followers /
 * overview UI. Idempotent: skips characters that already carry traits.
 *
 * Callers must have already detached the namedCharacters array (via
 * `detachNamedArray` or `ensureNamedArray` after a prior detach) when
 * mutating in the same tick.
 */
export function ensureCharacterTraits(
  state: GameState,
  characterId: string,
  count: number = 2,
): void {
  const list = ensureNamedArray(state);
  const idx = list.findIndex((c) => c.id === characterId);
  if (idx === -1) return;
  const c = list[idx];
  if (Array.isArray(c.traits) && c.traits.length > 0) return;
  const traits = pickRoleAwareTraits(c.role, count);
  if (traits.length === 0) return;
  const updated: NamedCharacter = { ...c, traits };
  updated.backstory = generateCharacterBio(updated);
  list[idx] = updated;
}

function makeName(role: CharacterRole): string {
  const first = pick(ROLE_FIRST[role] ?? ROLE_FIRST.celebrity);
  const last = pick(LAST_NAMES);
  if (role === "preacher") return `${first} ${last}`;
  return `${first} ${last}`;
}

function ensureNamedArray(state: GameState): NamedCharacter[] {
  if (!Array.isArray(state.namedCharacters)) state.namedCharacters = [];
  return state.namedCharacters;
}

/**
 * Replace `state.namedCharacters` with a fresh array clone so subsequent
 * spawn/recordEvent calls in the same tick don't mutate the prior state's
 * underlying array (runTick uses a shallow `{...state}` clone).
 */
function detachNamedArray(state: GameState): NamedCharacter[] {
  const next = Array.isArray(state.namedCharacters) ? [...state.namedCharacters] : [];
  state.namedCharacters = next;
  return next;
}

function currentYear(state: GameState): number {
  return state.gameDate?.year ?? 0;
}

export function spawnNamedCharacter(
  state: GameState,
  role: CharacterRole,
  opts: {
    factionId?: string | null;
    districtId?: string | null;
    introText?: string;
    notoriety?: number;
    traits?: string[];
  } = {},
): NamedCharacter {
  const list = ensureNamedArray(state);
  const year = currentYear(state);
  let id = `npc-${role}-${year}-${list.length}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  // Defensive de-dupe (vanishingly unlikely but cheap).
  while (list.some((c) => c.id === id)) {
    id = `${id}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
  // If the caller didn't specify traits, auto-attach 1–2 role-aware traits
  // so the generated bio surfaces personality flavor. Callers that want a
  // blank-trait NPC can opt out by passing `traits: []`.
  const traits = opts.traits !== undefined
    ? opts.traits
    : pickRoleAwareTraits(role, 1 + Math.floor(Math.random() * 2));
  const character: NamedCharacter = {
    id,
    name: makeName(role),
    role,
    factionId: opts.factionId ?? null,
    districtId: opts.districtId ?? null,
    status: "active",
    notoriety: opts.notoriety ?? 10,
    traits,
    bornYear: year - (20 + Math.floor(Math.random() * 30)),
    introducedYear: year,
    lastSeenYear: year,
    history: opts.introText ? [{ year, text: opts.introText }] : [],
    backstory: "",
  };
  character.backstory = generateCharacterBio(character);
  list.push(character);
  // Enforce caps eagerly so the array stays bounded between year-
  // rollovers. Without this, a play session shorter than one in-game
  // year (≈35,040 ticks at 15-min cadence) would never trigger a cull
  // and namedCharacters would grow unbounded.
  //
  // Pass the new character's id as protectedId so the same-call cull
  // can never demote the just-spawned NPC. Otherwise, if the role was
  // already at MAX_ACTIVE_PER_ROLE and incumbents had higher notoriety,
  // the cull would pick the new arrival as the demotion victim — and
  // we'd return a local "active" reference while state held a "missing"
  // entry, breaking the spawn contract that downstream consumers rely
  // on (e.g. getOrPickActiveNPC).
  enforceCharacterCaps(state, year, character.id);
  return character;
}

/**
 * Returns an active NPC of the given role (preferring highest notoriety),
 * or spawns a new one if none qualify. Useful for event hookups that want
 * to reuse existing characters when possible.
 */
export function getOrPickActiveNPC(
  state: GameState,
  role: CharacterRole,
  opts: {
    factionId?: string | null;
    districtId?: string | null;
    spawnChance?: number;
  } = {},
): NamedCharacter {
  const list = ensureNamedArray(state);
  const candidates = list.filter(
    (c) =>
      c.role === role &&
      c.status === "active" &&
      (opts.factionId == null || c.factionId === opts.factionId),
  );
  const spawnChance = opts.spawnChance ?? 0.35;
  if (candidates.length === 0 || Math.random() < spawnChance) {
    return spawnNamedCharacter(state, role, {
      factionId: opts.factionId,
      districtId: opts.districtId,
    });
  }
  candidates.sort((a, b) => b.notoriety - a.notoriety);
  const picked = candidates[0];
  // Backfill traits onto legacy NPCs that pre-date trait wiring so any
  // event surfacing them produces trait-driven bio flavor.
  ensureCharacterTraits(state, picked.id, 1 + Math.floor(Math.random() * 2));
  const list2 = ensureNamedArray(state);
  return list2.find((c) => c.id === picked.id) ?? picked;
}

export function recordCharacterEvent(
  state: GameState,
  characterId: string,
  text: string,
  notorietyDelta: number = 3,
): void {
  const list = ensureNamedArray(state);
  const idx = list.findIndex((c) => c.id === characterId);
  if (idx === -1) return;
  const c = list[idx];
  const year = currentYear(state);
  const history = [...c.history, { year, text }];
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
  list[idx] = {
    ...c,
    lastSeenYear: year,
    notoriety: Math.max(0, Math.min(100, c.notoriety + notorietyDelta)),
    history,
  };
}

export function setCharacterStatus(
  state: GameState,
  characterId: string,
  status: CharacterStatus,
  reasonText?: string,
): void {
  const list = ensureNamedArray(state);
  const idx = list.findIndex((c) => c.id === characterId);
  if (idx === -1) return;
  const c = list[idx];
  const year = currentYear(state);
  const history = reasonText
    ? [...c.history, { year, text: reasonText }]
    : c.history;
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
  list[idx] = { ...c, status, lastSeenYear: year, history };
}

/**
 * Cap-enforcement pass — invariant guard for the namedCharacters array.
 *
 * Runs at year-rollover (via tickNamedCharacters) AND at spawn time (via
 * spawnNamedCharacter). Spawn-time enforcement is what makes the cap a
 * real invariant rather than an annual janitor; see the comment block at
 * the top of this file for why.
 *
 * Steps:
 *   1. Per-role active cap: roles with > MAX_ACTIVE_PER_ROLE active
 *      members get the oldest (by lastSeenYear, then notoriety) demoted
 *      to "missing".
 *   2. Inactive trim: if total inactive (missing/dead/jailed/exiled)
 *      exceeds MAX_INACTIVE_RETAINED, drop the least recently seen /
 *      least notorious entries.
 *
 * `cullYear` is stamped onto the demotion history note. Pass the current
 * in-game year for spawn-time calls and the new year for year-rollover.
 *
 * `protectedId` (optional) marks one character as ineligible for the
 * per-role demotion victim pool. Used by spawnNamedCharacter to ensure a
 * just-spawned NPC is never demoted in the same call (which would break
 * the spawn contract — caller would receive a "active" local reference
 * while state holds a "missing" entry). The protected character still
 * counts toward the role's active total, so an incumbent will be
 * demoted in its place to honor the cap.
 */
function enforceCharacterCaps(
  state: GameState,
  cullYear: number,
  protectedId?: string,
): void {
  const list = ensureNamedArray(state);
  if (list.length === 0) return;
  const next: NamedCharacter[] = [...list];

  // Cap active per role: drop oldest by lastSeenYear into "missing".
  const byRole = new Map<CharacterRole, NamedCharacter[]>();
  for (const c of next) {
    if (c.status !== "active") continue;
    const arr = byRole.get(c.role) ?? [];
    arr.push(c);
    byRole.set(c.role, arr);
  }
  for (const [, arr] of byRole) {
    if (arr.length <= MAX_ACTIVE_PER_ROLE) continue;
    // Eligible cull candidates exclude the protected id. The protected
    // entry still counts toward role total (so we do cull `arr.length -
    // MAX` characters), it just can't be the victim.
    const eligible = protectedId
      ? arr.filter((c) => c.id !== protectedId)
      : arr;
    eligible.sort((a, b) => a.lastSeenYear - b.lastSeenYear || a.notoriety - b.notoriety);
    const cull = Math.min(arr.length - MAX_ACTIVE_PER_ROLE, eligible.length);
    for (let i = 0; i < cull; i++) {
      const target = eligible[i];
      const idx = next.findIndex((c) => c.id === target.id);
      if (idx !== -1) {
        next[idx] = {
          ...target,
          status: "missing",
          history: [
            ...target.history,
            { year: cullYear, text: "No longer in active circulation." },
          ].slice(-HISTORY_CAP),
        };
      }
    }
  }

  // Trim accumulated inactive characters. Active are already capped
  // above; inactive (missing/dead/jailed/exiled) had no upper bound,
  // which was a real save-size leak. Keep the most recently seen and
  // most notorious; drop the rest.
  const active: NamedCharacter[] = [];
  const inactive: NamedCharacter[] = [];
  for (const c of next) {
    if (c.status === "active") active.push(c);
    else inactive.push(c);
  }
  if (inactive.length > MAX_INACTIVE_RETAINED) {
    inactive.sort(
      (a, b) =>
        b.lastSeenYear - a.lastSeenYear || b.notoriety - a.notoriety,
    );
    inactive.length = MAX_INACTIVE_RETAINED;
  }
  state.namedCharacters = [...active, ...inactive];
}

/**
 * Year-rollover pass: prune characters who haven't appeared in many years
 * (mark as missing), and cap the active roster per role.
 */
export function tickNamedCharacters(state: GameState, newYear: number): void {
  const list = ensureNamedArray(state);
  if (list.length === 0) return;

  // Stale demotion: active characters not seen in STALE_YEARS years go
  // missing. Year-specific; only meaningful at year-rollover.
  state.namedCharacters = list.map((c) => {
    if (c.status !== "active") return c;
    if (newYear - c.lastSeenYear >= STALE_YEARS) {
      return {
        ...c,
        status: "missing" as CharacterStatus,
        history: [
          ...c.history,
          { year: newYear, text: "Faded from public view." },
        ].slice(-HISTORY_CAP),
      };
    }
    return c;
  });

  enforceCharacterCaps(state, newYear);
}

const WEEKLY_NOTABLE_ROLES: CharacterRole[] = [
  "gang_lieutenant",
  "journalist",
  "tycoon",
  "agitator",
  "preacher",
  "union_boss",
];

const WEEKLY_NOTABLE_LINES: Record<CharacterRole, string[]> = {
  gang_lieutenant: [
    "spotted directing a shakedown in the markets.",
    "linked to a fresh cache of stolen plasma cells.",
    "rumored to be courting a rival crew for a merger.",
  ],
  journalist: [
    "filed a story alleging procurement fraud in the bureaus.",
    "broadcast a citizen interview that's circulating in the lower wards.",
    "published a piece on rising rents in the worker districts.",
  ],
  tycoon: [
    "announced a new manufacturing line and three hundred hires.",
    "quietly bought out two indie chains this quarter.",
    "petitioned the council for tax relief on raw imports.",
  ],
  agitator: [
    "led a sit-in outside the labor exchange.",
    "drew a crowd at the wall plaza demanding wage hikes.",
    "is organizing rent strikes in the worker blocks.",
  ],
  celebrity: [
    "drew record viewership on tonight's public broadcast.",
    "appeared at a charity gala for war orphans.",
    "made headlines for a fresh feud with a rival faction.",
  ],
  informant: [
    "passed fresh intel to bureau handlers.",
    "went silent for three days, then resurfaced near the docks.",
    "is suspected of double-dealing with a syndicate.",
  ],
  fugitive: [
    "evaded a checkpoint sweep in the outer districts.",
    "was sighted near a known smuggling tunnel.",
    "remains at large despite a fresh bounty raise.",
  ],
  preacher: [
    "drew hundreds to an unsanctioned outdoor sermon.",
    "denounced the council from a rooftop pulpit.",
    "is being watched after recruiting youth militias.",
  ],
  union_boss: [
    "called a one-day work stoppage at the foundries.",
    "negotiated a new contract for the dock crews.",
    "is rallying support for a city-wide labor council.",
  ],
};

// ──────────────────────────────────────────────────────────────────────
// Trait-flavored news lines (task #50). When the surfaced NPC carries
// one of these traits AND a flavored variant exists for their role, we
// prefer the trait-flavored line ~70% of the time so the same name on
// the news feed reads differently when the figure is corrupt vs.
// idealistic, brutal vs. charismatic, etc. Falls back to the role's
// generic pool when no flavor matches. Keeps the table small and
// strongly-themed so it reads like a writer's voice, not a permutation.
// ──────────────────────────────────────────────────────────────────────
const TRAIT_FLAVORED_LINES: Partial<
  Record<string, Partial<Record<CharacterRole, string[]>>>
> = {
  corrupt: {
    gang_lieutenant: [
      "was photographed receiving an envelope from a bureau aide.",
      "is rumored to be paying off two precinct captains at once.",
    ],
    tycoon: [
      "is under quiet inquiry over a sweetheart procurement deal.",
      "had a rival's permit pulled days after a private dinner.",
    ],
    journalist: [
      "killed a story after a quiet meeting with a corporate counsel.",
      "is suspected of selling source lists to a rival outlet.",
    ],
    union_boss: [
      "approved a sweetheart contract that buries a kickback clause.",
    ],
  },
  brutal: {
    gang_lieutenant: [
      "left two rivals hospitalized over a missed payment.",
      "ordered an enforcer to make an example in the open market.",
    ],
    agitator: [
      "let a counter-protester get worked over before stepping in.",
    ],
    fugitive: [
      "is wanted in connection with a fresh shooting in the undercity.",
    ],
  },
  charismatic: {
    agitator: [
      "drew a record crowd to the plaza with a single broadcast.",
      "swung an undecided ward council with a single speech.",
    ],
    preacher: [
      "filled a derelict warehouse to standing room with a sermon.",
    ],
    union_boss: [
      "rallied three rival locals into one strike vote.",
    ],
    celebrity: [
      "moved a sold-out crowd to chant a campaign slogan unprompted.",
    ],
  },
  idealistic: {
    journalist: [
      "refused a paid placement and ran the unflattering story anyway.",
    ],
    agitator: [
      "is sleeping at the picket line until the council answers.",
    ],
    preacher: [
      "gave away the offering to a tenant facing eviction.",
    ],
  },
  cynical: {
    journalist: [
      "filed a piece arguing the council vote was decided weeks ago.",
    ],
    informant: [
      "is asking a higher rate, citing a rough season for everyone.",
    ],
  },
  paranoid: {
    fugitive: [
      "is reportedly moving to a new safe house every other night.",
    ],
    informant: [
      "demanded a face-to-face in three different locations this week.",
    ],
  },
  ruthless: {
    tycoon: [
      "moved to crush a smaller competitor with a price war.",
    ],
    gang_lieutenant: [
      "executed a defector in front of his own crew.",
    ],
  },
  ambitious: {
    tycoon: [
      "signaled an interest in buying out a council member's stake.",
    ],
    gang_lieutenant: [
      "is openly auditioning to replace his own boss.",
    ],
    union_boss: [
      "is positioning for a city-wide labor council seat.",
    ],
  },
};

/**
 * Pick a news line for an NPC, preferring a trait-flavored variant when
 * the NPC's traits offer one for their role. (Task #50.) Returns null
 * if no traits matched or if the random roll fell back to the generic
 * pool, so callers compose the same way for both paths.
 */
export function pickTraitFlavoredLine(npc: NamedCharacter, role: CharacterRole): string | null {
  const traits = Array.isArray(npc.traits) ? npc.traits : [];
  if (traits.length === 0) return null;
  const candidates: string[] = [];
  for (const t of traits) {
    const byRole = TRAIT_FLAVORED_LINES[t];
    if (!byRole) continue;
    const lines = byRole[role];
    if (!lines || lines.length === 0) continue;
    for (const l of lines) candidates.push(l);
  }
  if (candidates.length === 0) return null;
  // 70/30 prefer flavored over generic when at least one flavor exists.
  if (Math.random() > 0.7) return null;
  // Anti-repeat: don't reuse a line the NPC already emitted in their last
  // ANTI_REPEAT_WINDOW history entries. recordCharacterEvent stores the
  // raw line as `text`, so a substring/equality check here is sufficient.
  // Falls back to the full pool only when every candidate was recently
  // used — rare in practice, but keeps the path safe.
  const ANTI_REPEAT_WINDOW = 4;
  const history = Array.isArray(npc.history) ? npc.history : [];
  const recent = history.slice(-ANTI_REPEAT_WINDOW).map((h) => h.text);
  const fresh = candidates.filter((c) => !recent.includes(c));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Periodic news beat — invoked weekly from the tick loop. Picks an existing
 * notable figure (or spawns one) and emits a small news item, building the
 * sense that the city has named people in it.
 */
export function maybeEmitWeeklyNotable(state: GameState): GameMessage | null {
  if (!state.gameDate) return null;
  // Task #58: trait-driven nudge to spawn cadence. Paranoid / talkative /
  // charismatic NPCs lift the gate; quiet / stoic NPCs lower it.
  // applyTraitMultiplierToDelta + clampMult keep the threshold safely
  // inside (0, 1) for any plausible NPC stack.
  const spawnMult = computeCityTraitMultipliers(state).eventSpawnMult;
  const threshold = applyTraitMultiplierToDelta(0.6, spawnMult);
  if (Math.random() > threshold) return null;

  // Detach the array once so the spawn/record helpers below don't mutate
  // the prior state's underlying namedCharacters reference.
  detachNamedArray(state);

  const role = WEEKLY_NOTABLE_ROLES[Math.floor(Math.random() * WEEKLY_NOTABLE_ROLES.length)];
  // getOrPickActiveNPC already backfills role-aware traits onto legacy NPCs
  // and spawnNamedCharacter auto-attaches them on fresh spawns, so the
  // returned npc is guaranteed to have traits by the time we use it here.
  const npc = getOrPickActiveNPC(state, role, { spawnChance: 0.2 });
  const line =
    pickTraitFlavoredLine(npc, npc.role) ??
    pick(WEEKLY_NOTABLE_LINES[role] ?? ["was seen in public this week."]);
  const text = `${npc.name} (${getCharacterRoleLabel(npc.role)}) ${line}`;
  recordCharacterEvent(state, npc.id, line, 2);

  return {
    id: `notable-${npc.id}-${state.gameDate.year}-${state.gameDate.month}-${state.gameDate.day}-${state.gameDate.hour}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks ?? 0,
    category: "intel",
    title: `Notable Figure: ${npc.name}`,
    body: text,
    read: false,
    priority: "low",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Additional event hookups that surface NPCs with traits attached.
// Each is invoked from the tick loop on a different cadence and emits
// at most one GameMessage per call.
// ──────────────────────────────────────────────────────────────────────

const FACTION_FLASHPOINT_LINES: Partial<Record<CharacterRole, string[]>> = {
  gang_lieutenant: [
    "is leaning on shopkeepers in the contested blocks again.",
    "ordered a midnight raid on a rival's stash house.",
    "is muscling out independent crews to consolidate the corner.",
  ],
  agitator: [
    "rallied dock workers against the morning shift roster.",
    "is calling for a march on the council building this weekend.",
    "broke up a recruiting drive run by a rival faction.",
  ],
};

/**
 * Faction flashpoint beat — surfaces a gang lieutenant or agitator tied
 * to an active faction (when one is available) and emits a brief news
 * item. Always tags the surfaced NPC with role-aware traits.
 */
export function maybeEmitFactionFlashpoint(state: GameState): GameMessage | null {
  if (!state.gameDate) return null;
  // Task #58: city-wide event-spawn nudge — see maybeEmitWeeklyNotable.
  const spawnMult = computeCityTraitMultipliers(state).eventSpawnMult;
  const threshold = applyTraitMultiplierToDelta(0.45, spawnMult);
  if (Math.random() > threshold) return null;

  detachNamedArray(state);

  const role: CharacterRole = Math.random() < 0.5 ? "gang_lieutenant" : "agitator";
  const factions = Array.isArray(state.factions) ? state.factions : [];
  const fac = factions.find((f) => f && f.isActive) ?? null;
  const factionId = fac?.id ?? null;
  const npc = getOrPickActiveNPC(state, role, { factionId, spawnChance: 0.25 });
  ensureCharacterTraits(state, npc.id, 1 + Math.floor(Math.random() * 2));

  const lines = FACTION_FLASHPOINT_LINES[role] ?? ["is making moves in the lower wards."];
  const line = pickTraitFlavoredLine(npc, npc.role) ?? pick(lines);
  const facName = fac?.name ? ` Tied to ${fac.name}.` : "";
  const text = `${npc.name} (${getCharacterRoleLabel(npc.role)}) ${line}${facName}`;
  recordCharacterEvent(state, npc.id, line, 3);

  return {
    id: `flashpoint-${npc.id}-${state.gameDate.year}-${state.gameDate.month}-${state.gameDate.day}-${state.gameDate.hour}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks ?? 0,
    category: "intel",
    title: `Faction Flashpoint: ${npc.name}`,
    body: text,
    read: false,
    priority: "normal",
  };
}

const UNDERCITY_RUMOR_LINES: Partial<Record<CharacterRole, string[]>> = {
  fugitive: [
    "was spotted moving through a checkpoint blind spot last night.",
    "has reportedly cut a deal with a smuggler crew for safe passage.",
    "left a coded message at a known dead-drop in the undercity.",
  ],
  preacher: [
    "is drawing a flock to a salvage-yard sermon.",
    "denounced the bureaus from a rooftop pulpit at dawn.",
    "began a fast that's drawing media attention.",
  ],
  informant: [
    "passed a fresh dossier to bureau handlers and asked for hazard pay.",
    "went silent for two days, then resurfaced near the smelters.",
    "is suspected of double-dealing with a rival syndicate.",
  ],
};

/**
 * Undercity rumor beat — surfaces a fugitive, preacher, or informant
 * with role-aware traits attached. Lower frequency than the weekly
 * notable beat to avoid news-feed spam.
 */
export function maybeEmitUndercityRumor(state: GameState): GameMessage | null {
  if (!state.gameDate) return null;
  // Task #58: city-wide event-spawn nudge — see maybeEmitWeeklyNotable.
  const spawnMult = computeCityTraitMultipliers(state).eventSpawnMult;
  const threshold = applyTraitMultiplierToDelta(0.35, spawnMult);
  if (Math.random() > threshold) return null;

  detachNamedArray(state);

  const roleRoll = Math.random();
  const role: CharacterRole =
    roleRoll < 0.4 ? "fugitive" : roleRoll < 0.75 ? "preacher" : "informant";
  const npc = getOrPickActiveNPC(state, role, { spawnChance: 0.25 });
  ensureCharacterTraits(state, npc.id, 1 + Math.floor(Math.random() * 2));

  const lines = UNDERCITY_RUMOR_LINES[role] ?? ["was the subject of fresh chatter this week."];
  const line = pickTraitFlavoredLine(npc, npc.role) ?? pick(lines);
  const text = `${npc.name} (${getCharacterRoleLabel(npc.role)}) ${line}`;
  recordCharacterEvent(state, npc.id, line, 2);

  return {
    id: `undercity-${npc.id}-${state.gameDate.year}-${state.gameDate.month}-${state.gameDate.day}-${state.gameDate.hour}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks ?? 0,
    category: "intel",
    title: `Undercity Rumor: ${npc.name}`,
    body: text,
    read: false,
    priority: "low",
  };
}

const MARKET_MOVE_LINES: Partial<Record<CharacterRole, string[]>> = {
  tycoon: [
    "announced a hostile takeover of a smaller competitor.",
    "shifted a major contract to a politically-connected supplier.",
    "is lobbying the council for an export tax exemption.",
  ],
  union_boss: [
    "secured a back-pay settlement for the foundry crews.",
    "is rallying support for a city-wide strike vote.",
    "negotiated a new safety clause into the dock contract.",
  ],
};

/**
 * Market move beat — surfaces a tycoon or union boss with role-aware
 * traits. Intended for a slower cadence (e.g. monthly).
 */
export function maybeEmitMarketMove(state: GameState): GameMessage | null {
  if (!state.gameDate) return null;
  // Task #58: city-wide event-spawn nudge — see maybeEmitWeeklyNotable.
  const spawnMult = computeCityTraitMultipliers(state).eventSpawnMult;
  const threshold = applyTraitMultiplierToDelta(0.5, spawnMult);
  if (Math.random() > threshold) return null;

  detachNamedArray(state);

  const role: CharacterRole = Math.random() < 0.55 ? "tycoon" : "union_boss";
  const npc = getOrPickActiveNPC(state, role, { spawnChance: 0.25 });
  ensureCharacterTraits(state, npc.id, 1 + Math.floor(Math.random() * 2));

  const lines = MARKET_MOVE_LINES[role] ?? ["made a move worth watching this month."];
  const line = pickTraitFlavoredLine(npc, npc.role) ?? pick(lines);
  const text = `${npc.name} (${getCharacterRoleLabel(npc.role)}) ${line}`;
  recordCharacterEvent(state, npc.id, line, 3);

  return {
    id: `market-${npc.id}-${state.gameDate.year}-${state.gameDate.month}-${state.gameDate.day}-${state.gameDate.hour}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks ?? 0,
    category: "intel",
    title: `Market Move: ${npc.name}`,
    body: text,
    read: false,
    priority: "low",
  };
}
