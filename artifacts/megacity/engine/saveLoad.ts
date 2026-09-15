import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import { createDefaultAugSlots, createDefaultPlayer, createInitialState } from "@/engine/initialState";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import { invalidateTechCache } from "@/engine/perfCache";
import { TECH_MAP } from "@/engine/technologies";
import { POLICY_MAP } from "@/engine/policies";
import { createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import { DEFAULT_PLAYER_CITY_POSITION } from "@/engine/worldMap";
import { getBiosphereCrisisRisk } from "@/engine/wildlandsEcology";
import { STAT_WIN_BAND_BY_KEY, computeStatBandRank } from "@/engine/statWinBands";
import type { GameState } from "@/engine/types";
import { CLASS_DEFS, type TroopClassId } from "@/engine/retinueData";
import { createDefaultAutoRecruitConfig, type AutoRecruitConfig } from "@/engine/autoRecruit";
import { createDefaultAutoDomainConfigs } from "@/engine/autoDomainManagers";
import {
  FAITH_IDS,
  isFaithId,
  isFaithStance,
  normalizeShares,
  type FaithState,
  type FaithStance,
  type DistrictFaithShares,
} from "@/engine/faiths";
import { compactStateForSave } from "@/engine/independentEnterprises";
import { isCommanderOriginId } from "@/engine/commanderOrigins";
import { computePopulationCohorts } from "@/engine/populationCohorts";
import { sanitizeInfrastructureLedger, infrastructureHealthPercent } from "@/engine/infrastructureLedger";
import { canonicalizeLegacyWorldIntelText, scrubLegacyContent } from "@/engine/legacyContent";
import { applyCanonicalLACityPresentation, normalizeTradeInventory, operationalFromSettlement } from "@/engine/settlementData";
import { normalizeMegacityRoster } from "@/engine/settlementRoster";
import { applyCanonicalContinuancePresentation, CONTINUANCE_ID } from "@/engine/continuance";
import { sanitizeRetiredEvents } from "@/engine/eventRetirement";
import { createDefaultCustodyState, sanitizeCustodyState } from "@/engine/custody";

export const BACKUP_SUFFIX = "_backup";
export const TMP_SUFFIX = ".tmp";

// These collections are persisted user input. Keep the generous cap above
// the current catalog sizes so a legitimate fully-unlocked save survives,
// while preventing an edited save from retaining an unbounded array.
const SAVE_ID_ARRAY_CAP = 500;
const RESEARCH_QUEUE_CAP = 50;

type RelationshipScoreFallback = {
  influence?: unknown;
  loyalty?: unknown;
  threat?: unknown;
  cityHealth?: unknown;
  attrition?: unknown;
};

function boundedRelationshipScore(value: unknown, fallback: unknown, defaultValue: number): number {
  const candidate = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : defaultValue;
  return Math.max(0, Math.min(100, candidate));
}

function normalizeRelationshipScores<T extends GameState["externalMegacities"][number] | NonNullable<GameState["townships"]>[number]>(
  entity: T,
  fallback: RelationshipScoreFallback = {},
): T {
  return {
    ...entity,
    influence: boundedRelationshipScore(entity.influence, fallback.influence, 50),
    loyalty: boundedRelationshipScore(entity.loyalty, fallback.loyalty, 50),
    threat: boundedRelationshipScore(entity.threat, fallback.threat, 0),
    cityHealth: boundedRelationshipScore(entity.cityHealth, fallback.cityHealth, 100),
    attrition: boundedRelationshipScore(entity.attrition, fallback.attrition, 0),
  } as T;
}

function normalizeCoerciveBacklashLog(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string =>
    typeof entry === "string" && entry.length > 0,
  ))].slice(-200);
}

function normalizeKnownIds(value: unknown, known: Record<string, unknown>, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(known, id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length === cap) break;
  }
  return normalized;
}

function normalizeActiveResearch(value: unknown): GameState["activeResearch"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.techId !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(TECH_MAP, raw.techId)) return null;
  const tech = TECH_MAP[raw.techId];

  const cost = tech.researchCost * RESEARCH_COST_MULTIPLIER;
  const savedCost = typeof raw.cost === "number" && Number.isFinite(raw.cost) && raw.cost > 0
    ? raw.cost
    : null;
  const savedProgress = typeof raw.progress === "number" && Number.isFinite(raw.progress) && raw.progress >= 0
    ? raw.progress
    : 0;
  // Old saves may have used a different multiplier. Preserve their completed
  // fraction, but never let malformed values complete a technology for free.
  const progress = savedCost === null
    ? 0
    : Math.min(Math.floor((savedProgress / savedCost) * cost), cost);
  return { techId: raw.techId, cost, progress };
}

/**
 * Typed error thrown by the slot-write path. Lets the UI distinguish
 * "out of storage" from a generic crash so it can surface a clear
 * "save failed — storage full" message instead of a silent
 * console.error. The originating error is kept on `cause` for logs.
 *
 * `kind`:
 *   - "quota"   — backend reported a quota / disk-full condition.
 *   - "io"      — generic IO failure (permission, native bridge, etc).
 */
export class SaveWriteError extends Error {
  readonly kind: "quota" | "io";
  readonly cause?: unknown;
  constructor(kind: "quota" | "io", message: string, cause?: unknown) {
    super(message);
    this.name = "SaveWriteError";
    this.kind = kind;
    this.cause = cause;
  }
}

/**
 * Best-effort detection of a storage-quota / disk-full failure across the
 * backends we ship to (web localStorage via AsyncStorage shim, native
 * AsyncStorage on iOS/Android, Steam build's Node fs shim). Each surface
 * reports quota differently, so we pattern-match on the bits that are
 * stable: DOMException names, errno strings, and the standard ENOSPC.
 */
function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; code?: string | number; message?: string };
  if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (e.code === 22 || e.code === 1014) return true; // legacy DOMException codes
  if (typeof e.code === "string" && (e.code === "ENOSPC" || e.code === "EDQUOT")) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("quota") || msg.includes("disk full") || msg.includes("no space") || msg.includes("enospc");
}

function wrapWriteError(err: unknown, where: string): SaveWriteError {
  if (err instanceof SaveWriteError) return err;
  const kind = isQuotaError(err) ? "quota" : "io";
  const detail = err instanceof Error ? err.message : String(err);
  return new SaveWriteError(kind, `${where}: ${detail}`, err);
}

/**
 * Minimal storage interface that AsyncStorage already satisfies, so the
 * write helpers below can be used in both production code and tests
 * (where a `Map`-backed mock stands in for AsyncStorage).
 *
 * `removeItem`, `multiSet`, `multiRemove` are optional: where a backend
 * supports them they enable a stronger atomic-swap path; otherwise the
 * helpers fall back to per-key `setItem` calls (which AsyncStorage's
 * web/native backends already treat as per-key atomic).
 */
export interface SlotStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
  multiSet?(pairs: [string, string][]): Promise<void>;
  multiRemove?(keys: string[]): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
}

/**
 * Sweep orphaned `*.tmp` keys left behind by a crash between the
 * tmp-write and the cleanup phases of `atomicWriteSlot` (or the
 * panic-save path). Phase 3 of the atomic write is best-effort, so a
 * process kill between the slot-key swap and the tmp-key delete leaves
 * a stale tmp blob in storage. Each one is harmless on its own — the
 * next save in the same slot overwrites it — but if the player rotates
 * through slots, or the app crashes repeatedly, tmp blobs can
 * accumulate and bloat AsyncStorage usage.
 *
 * Safe to run only when no in-flight save can be touching a tmp key,
 * i.e. before the SlotLock is handed out (init/startup). Caller passes
 * the slot-key prefixes whose tmp leftovers should be reaped; any other
 * keys (including non-tmp keys that happen to share a prefix) are left
 * untouched. Returns the list of keys actually removed for diagnostics
 * / tests.
 *
 * No-op when the backend doesn't expose `getAllKeys` — without an
 * enumeration primitive there's no safe way to find leftovers without
 * making assumptions about slot count, and the leftover-on-next-save
 * fallback already keeps things bounded.
 */
export async function sweepStaleTmpKeys(
  storage: SlotStorage,
  prefixes: readonly string[],
): Promise<string[]> {
  if (!storage.getAllKeys) return [];
  let all: readonly string[];
  try {
    all = await storage.getAllKeys();
  } catch {
    return [];
  }
  const stale = all.filter(
    (k) => k.endsWith(TMP_SUFFIX) && prefixes.some((p) => k.startsWith(p)),
  );
  if (stale.length === 0) return [];
  try {
    if (storage.multiRemove) {
      await storage.multiRemove([...stale]);
    } else if (storage.removeItem) {
      for (const k of stale) {
        try {
          await storage.removeItem(k);
        } catch {
          /* keep going — best-effort */
        }
      }
    }
  } catch {
    /* best-effort: a leftover tmp will just be reswept next launch */
  }
  return [...stale];
}

/**
 * Slot writer with torn-write protection. Used by every public
 * slot-write path below so a power-loss / OS-kill between bytes never
 * leaves the slot key holding half-written garbage.
 *
 * NOTE: AsyncStorage has no filesystem-level rename primitive, so the
 * "atomicity" guarantee here is the union of two weaker primitives,
 * not a true atomic swap:
 *
 *   1. Per-key commit atomicity — a single `setItem(slotKey, ...)`
 *      call is treated as atomic by AsyncStorage backends (SQLite
 *      transaction on native, single localStorage entry on web). The
 *      value either flips fully to the new bytes or stays at the old
 *      bytes; it can't end up half-old / half-new within one setItem.
 *   2. Pre-stage to a temp key — Phase 1 lands the full payload on
 *      `<slotKey>.tmp` first. If the process dies during Phase 1 or
 *      between Phase 1 and Phase 2, the live slot key has not been
 *      touched yet, so the prior value survives.
 *
 * Sequence:
 *   1. Full write to `<slotKey>.tmp`. A torn write here only damages
 *      tmp; the live slot key is untouched.
 *   2. Backup rotation + commit. When the backend exposes `multiSet`,
 *      the previous primary copies into `_backup` and the new primary
 *      commits in a single `multiSet` batch so the two writes can't
 *      tear apart relative to each other. Falls back to per-key
 *      `setItem` (still per-key atomic) where multiSet is unavailable.
 *   3. Best-effort cleanup of the tmp key. A leftover tmp blob is
 *      harmless and is overwritten by the next save.
 *
 * Stays inside the per-slot SlotLock that GameContext.saveToSlot
 * holds — torn-write protection is *inside* the lock, not a
 * replacement for it.
 */
export async function atomicWriteSlot(
  storage: SlotStorage,
  slotKey: string,
  wrappedRaw: string,
): Promise<void> {
  const tmpKey = slotKey + TMP_SUFFIX;
  const backupKey = slotKey + BACKUP_SUFFIX;

  // Phase 1: full write to tmp. A torn write here only damages tmp,
  // and — critically for the quota case — if the bytes won't fit at
  // all the backend rejects here, *before* we've touched the live
  // slot or backup keys. The previous good save survives untouched.
  try {
    await storage.setItem(tmpKey, wrappedRaw);
  } catch (err) {
    // Best-effort cleanup: a half-written tmp from a quota failure
    // could otherwise eat space the player needs to free up before
    // retrying. Ignore cleanup errors — the write itself is what
    // surfaces.
    try {
      if (storage.removeItem) await storage.removeItem(tmpKey);
    } catch {
      /* nothing to do */
    }
    throw wrapWriteError(err, "tmp write");
  }

  // Phase 2: rotate any existing primary into backup, then commit the
  // new value. Done as a single `multiSet` when the backend supports it
  // so a crash between the two writes can't leave the backup stale
  // relative to the new primary.
  const existing = await storage.getItem(slotKey);
  if (existing != null) {
    if (storage.multiSet) {
      try {
        await storage.multiSet([
          [backupKey, existing],
          [slotKey, wrappedRaw],
        ]);
      } catch (err) {
        console.warn("[atomicWriteSlot] multiSet failed, falling back:", err);
        // Fallback: write backup first (safe — same bytes already on
        // disk under primary), then commit the new primary. If the
        // primary commit also fails, propagate the original-style
        // error from the primary attempt so the UI sees the right
        // failure cause (quota vs. io).
        try {
          await storage.setItem(backupKey, existing);
        } catch (rotErr) {
          console.warn("[atomicWriteSlot] Backup rotation failed:", rotErr);
        }
        try {
          await storage.setItem(slotKey, wrappedRaw);
        } catch (commitErr) {
          throw wrapWriteError(commitErr, "primary commit (fallback)");
        }
      }
    } else {
      // Order matters: write backup first so a crash between the two
      // setItem calls leaves at minimum the previous-generation value
      // recoverable from `_backup`.
      try {
        await storage.setItem(backupKey, existing);
      } catch (rotErr) {
        console.warn("[atomicWriteSlot] Backup rotation failed:", rotErr);
      }
      try {
        await storage.setItem(slotKey, wrappedRaw);
      } catch (commitErr) {
        throw wrapWriteError(commitErr, "primary commit");
      }
    }
  } else {
    // No prior primary — just commit. Nothing to back up.
    try {
      await storage.setItem(slotKey, wrappedRaw);
    } catch (commitErr) {
      throw wrapWriteError(commitErr, "primary commit (cold)");
    }
  }

  // Phase 3: cleanup. Failures here are harmless leftovers.
  try {
    if (storage.multiRemove) await storage.multiRemove([tmpKey]);
    else if (storage.removeItem) await storage.removeItem(tmpKey);
  } catch {
    /* leftover tmp is overwritten on next save */
  }
}

/**
 * Centralized slot writer. Rotates any existing primary save into the
 * `_backup` slot first, then atomically swaps in the freshly-wrapped
 * state via the temp-key pattern. All GameContext slot writes go
 * through this so backup semantics stay uniform and corruption is
 * always recoverable from `_backup`.
 *
 * Returns the wrapped string in case the caller wants to push it to
 * cloud storage as well (avoids re-wrapping).
 */
export async function writeSlotSave(
  storage: SlotStorage,
  slotKey: string,
  state: GameState,
): Promise<string> {
  // Compact business records (drop default-valued fields). Sanitizer
  // rehydrates them on load so consumers don't have to special-case.
  const compacted = compactStateForSave(state);
  const wrapped = wrapSave(JSON.stringify(compacted));
  await atomicWriteSlot(storage, slotKey, wrapped);
  return wrapped;
}

/**
 * Write an already-wrapped raw save string into a slot, still rotating
 * any existing primary into `_backup`. Used when restoring an opaque
 * blob (e.g. Steam Cloud bytes) where re-wrapping would change the
 * checksum/payload.
 */
export async function writeSlotRaw(
  storage: SlotStorage,
  slotKey: string,
  wrappedRaw: string,
): Promise<void> {
  await atomicWriteSlot(storage, slotKey, wrappedRaw);
}

/**
 * Read a slot, apply a patch to the parsed state, and write it back —
 * with the same backup-rotation semantics as writeSlotSave. Used by
 * single-field updates (setSaveLabel, setHonorMode) that must not race
 * against the engine's own save cadence. Returns true if the patch was
 * applied, false if the slot was empty or unparseable.
 */
export async function patchSlotSave(
  storage: SlotStorage,
  slotKey: string,
  patch: (state: GameState) => GameState,
): Promise<boolean> {
  const raw = await storage.getItem(slotKey);
  if (!raw) return false;
  const { json } = unwrapSave(raw);
  let parsed: GameState;
  try {
    parsed = JSON.parse(json) as GameState;
  } catch {
    // Preserve the unparseable blob alongside the slot so the player (or
    // support) can recover it later — silently dropping it would have
    // hidden the failure and lost the only copy. Best-effort: a write
    // failure here is non-fatal because the original slot is still
    // intact.
    try {
      if (storage.setItem) {
        await storage.setItem(`${slotKey}_corrupt_${Date.now()}`, raw);
      }
    } catch { /* storage full or unavailable; original slot still intact */ }
    console.warn(`[saveLoad] patchSlotSave: slot "${slotKey}" is unparseable; preserved as _corrupt copy`);
    return false;
  }
  const next = patch(parsed);
  await writeSlotSave(storage, slotKey, next);
  return true;
}

// WARNING: never change this algorithm. unwrapSave treats a checksum mismatch
// over an intact JSON payload as evidence of hand-editing and permanently
// marks the save integrityCompromised (no more achievements). If the hash
// were ever changed, every legitimate player's existing save would be
// falsely flagged on next load.
export function computeChecksum(json: string): string {
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function wrapSave(json: string): string {
  const checksum = computeChecksum(json);
  const compressed = compressToUTF16(json);
  return JSON.stringify({ v: 2, checksum, data: compressed });
}

/**
 * Handle a payload whose checksum failed verification but which is still
 * fully intact JSON. That combination is the signature of a save edited
 * outside the game — real corruption almost always breaks decompression or
 * parsing before it produces a clean parse with the wrong checksum.
 * Rather than rejecting it (which would silently swap in the older backup),
 * the save loads normally with a durable integrityCompromised flag baked
 * into the state; achievement checks then stop awarding for that save (see
 * checkAchievements). Deliberately quiet — no UI surfaces the mark, and it
 * persists across re-saves because it lives inside the state itself.
 * Returns null when the payload is not intact JSON (true corruption), so
 * the caller falls back to the existing invalid-save path.
 */
function markTampered(json: string): { json: string; valid: boolean } | null {
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      (obj as Record<string, unknown>).integrityCompromised = true;
      return { json: JSON.stringify(obj), valid: true };
    }
  } catch { /* not intact JSON — genuine corruption */ }
  return null;
}

export function unwrapSave(raw: string): { json: string; valid: boolean } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.data === "string") {
      if (parsed.v === 2) {
        const decompressed = decompressFromUTF16(parsed.data);
        if (!decompressed) return { json: raw, valid: false };
        const expected = computeChecksum(decompressed);
        if (expected === parsed.checksum) return { json: decompressed, valid: true };
        return markTampered(decompressed) ?? { json: decompressed, valid: false };
      }
      if (parsed.v === 1) {
        const expected = computeChecksum(parsed.data);
        if (expected === parsed.checksum) return { json: parsed.data, valid: true };
        return markTampered(parsed.data) ?? { json: parsed.data, valid: false };
      }
    }
    return { json: raw, valid: true };
  } catch {
    return { json: raw, valid: false };
  }
}

// Task #562: pre-fix saves can hold multiple copies of the same static event
// id (the war-event generator only deduped against recent history, never
// against activeEvents, so war_ceasefire_offer piled up — worse under offline
// catch-up). Keep the FIRST occurrence of each id: array order is spawn order,
// so the oldest copy — the one the player has been looking at — survives.
export function dedupeActiveEventsById<T extends { id: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of events) {
    if (!e || typeof e.id !== "string" || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/**
 * Migrate old save format to current format.
 * Maps renamed building/unit keys and adds any missing fields.
 */
export function migrateState(saved: GameState): GameState {
  // Migration is a structural reset of the in-memory state — the unlocked
  // technologies array may be filtered (unknown ids dropped) and the buildings
  // map reshaped. The tech-effects cache is keyed on a content hash so a
  // post-migration build with a different set of ids will refresh on its own,
  // but explicitly invalidating here removes any chance of a stale singleton
  // surviving across a load.
  invalidateTechCache();
  const fresh = createInitialState();
  // Defensive: a malformed save might have buildings/units missing or set to
  // a non-object. Spread-on-null throws, so coerce first. The merge below
  // backfills with fresh defaults regardless.
  const rawB = (saved as any).buildings;
  const rawU = (saved as any).units;
  const b = { ...(rawB && typeof rawB === "object" ? rawB : {}) } as Record<string, number>;
  const u = { ...(rawU && typeof rawU === "object" ? rawU : {}) } as Record<string, number>;

  // ── Building key migrations (old → new) ────────────────────────────
  const bMigrations: Record<string, string> = {
    housingBlocks: "habBlockMegaTowers",
    powerPlants: "solarTowerFields",
    waterRecyclers: "waterRecyclingSuperFacilities",
    foodSynthFacilities: "syntheticFoodPlants",
    medicalCenters: "publicHealthMegaClinics",
    transitLines: "skyrailTransitLines",
    wasteProcessors: "sewerPurificationPlants",
    detentionPods: "solitaryDetentionBlocks",
    surveillanceSystems: "citywideSurveillanceGrid",
    researchLabs: "advancedResearchLabs",
    propagandaHubs: "propagandaBroadcastingTowers",
    industrialBuildings: "megaManufacturingPlants",
    vehicleDepots: "vehicleMaintenanceDepots",
    armories: "weaponsArmoryDepots",
    riotControlCenters: "riotControlCommandCenters",
  };

  for (const [oldKey, newKey] of Object.entries(bMigrations)) {
    if (b[oldKey] !== undefined) {
      b[newKey] = (b[newKey] ?? 0) + b[oldKey];
      delete b[oldKey];
    }
  }

  // ── Unit key migrations (old → new) ────────────────────────────────
  const uMigrations: Record<string, string> = {
    patrolUnits: "patrolJudges",
    riotSquads: "riotPoliceSquads",
    eliteEnforcers: "seniorJudges",
    armoredTeams: "armoredResponseUnits",
    drones: "surveillanceDrones",
    vehicles: "patrolCars",
  };

  for (const [oldKey, newKey] of Object.entries(uMigrations)) {
    if (u[oldKey] !== undefined) {
      u[newKey] = (u[newKey] ?? 0) + u[oldKey];
      delete u[oldKey];
    }
  }

  // ── Fill any missing buildings/units with fresh defaults ────────────
  const mergedBuildings = { ...fresh.buildings, ...b };
  const mergedUnits = { ...fresh.units, ...u };

  // ── cityStats: add defenseRating if missing ─────────────────────────
  // Defensive: saved.cityStats may be missing or non-object on a corrupted
  // save. Coerce to {} so .defenseRating dereferences don't throw before
  // sanitizeState gets a chance to clean things up.
  const rawStats = (saved as any).cityStats;
  const safeStats: any = rawStats && typeof rawStats === "object" ? rawStats : {};
  const mergedStats = {
    ...fresh.cityStats,
    ...safeStats,
    defenseRating: safeStats.defenseRating ?? 55,
    education: safeStats.education ?? 35,
    publicHealth: safeStats.publicHealth ?? 40,
    biosphere: safeStats.biosphere ?? 20,
    diseaseRisk: safeStats.diseaseRisk ?? 45,
    upliftPopulation: safeStats.upliftPopulation ?? 0,
  };

  const migrated: GameState = {
    ...fresh,
    ...saved,
    cityStats: mergedStats,
    buildings: mergedBuildings,
    units: mergedUnits,
    companies: saved.companies ?? [],
    // Task #500: legacy saves predate timed construction — they simply have
    // nothing under construction.
    pendingConstructions: saved.pendingConstructions ?? [],
    activeContracts: saved.activeContracts ?? [],
    completedContracts: saved.completedContracts ?? [],
    contractCapacity: saved.contractCapacity ?? 5,
    procurementPolicies: saved.procurementPolicies ?? {
      lowestBidPriority: false,
      qualityFirstProcurement: false,
      emergencyFastTrack: false,
      antiCorruptionOversight: false,
      civicLaborPreference: false,
      corporatePartnerIncentives: false,
      penalLaborConstruction: false,
      openTenderRequirement: false,
      securityScreening: false,
      blackBudgetWaivers: false,
    },
    player: (() => {
      const p = saved.player ?? createDefaultPlayer();
      if (p.title === "Sector Commander" || p.title === "Sector Marshal" || p.title === "Chief Judge") {
        p.title = "City Commander";
      }
      if (p.age === undefined) p.age = 35;
      if (p.sex === undefined) p.sex = "male";
      if (!p.augmentationSlots) p.augmentationSlots = createDefaultAugSlots();
      return p;
    })(),
    playerTitle: (saved.playerTitle === "Sector Marshal" || saved.playerTitle === "Chief Judge" || saved.playerTitle === "Sector Commander") ? "City Commander" : (saved.playerTitle ?? "City Commander"),
    commanderOrigin: isCommanderOriginId(saved.commanderOrigin) ? saved.commanderOrigin : "none",
    gameDate: saved.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 },
    messages: saved.messages ?? [],
    blackMarketHistory: saved.blackMarketHistory ?? [],
    officers: (saved.officers && saved.officers.length === fresh.officers.length)
      ? saved.officers
      : fresh.officers,
    cheats: saved.cheats ?? fresh.cheats,
    crimeStats: saved.crimeStats ? { ...fresh.crimeStats, ...saved.crimeStats } : fresh.crimeStats,
    utilities: saved.utilities ?? fresh.utilities,
    stockpiles: saved.stockpiles ? { ...fresh.stockpiles, ...saved.stockpiles } : fresh.stockpiles,
    tourism: saved.tourism ?? fresh.tourism,
    rates: saved.rates ? { ...fresh.rates, ...saved.rates } : fresh.rates,
    activeEdicts: saved.activeEdicts ?? [],
    edictCooldowns: saved.edictCooldowns ?? {},
    personalActionCooldowns: saved.personalActionCooldowns ?? {},
    personalActionHistory: saved.personalActionHistory ?? {},
    cohortStewardshipHistory: saved.cohortStewardshipHistory ?? [],
    custody: saved.custody && typeof saved.custody === "object" && "incarceration" in saved.custody
      ? sanitizeCustodyState(saved.custody)
      : (() => {
          const migrated = sanitizeCustodyState(saved.custody ?? fresh.custody);
          const legacyCount = Math.max(0, Math.round(saved.demographics?.prisonPopulation ?? 0));
          migrated.incarceration = createDefaultCustodyState(legacyCount).incarceration;
          return migrated;
        })(),
    tickIntervalMinutes: saved.tickIntervalMinutes ?? 15,
    demographics: saved.demographics ? { ...fresh.demographics, ...saved.demographics } : fresh.demographics,
    humanConsequences: saved.humanConsequences
      ? {
          ...fresh.humanConsequences!,
          ...saved.humanConsequences,
          deathsByCause: { ...fresh.humanConsequences!.deathsByCause, ...saved.humanConsequences.deathsByCause },
          woundedByCause: { ...fresh.humanConsequences!.woundedByCause, ...saved.humanConsequences.woundedByCause },
          missingByCause: { ...fresh.humanConsequences!.missingByCause, ...saved.humanConsequences.missingByCause },
        }
      : {
          ...fresh.humanConsequences!,
          totalCivilianDeaths: Math.max(0, Math.round(saved.demographics?.totalDeaths ?? 0)),
          lastCombatPopulationLosses: Math.max(0, Math.round(saved.combat?.totalPopulationLosses ?? 0)),
        },
    districts: (saved.districts && saved.districts.length === fresh.districts.length)
      ? saved.districts
      : fresh.districts,
    unlockedTechnologies: normalizeKnownIds(saved.unlockedTechnologies, TECH_MAP, SAVE_ID_ARRAY_CAP),
    activeResearch: normalizeActiveResearch(saved.activeResearch),
    researchQueue: normalizeKnownIds(saved.researchQueue, TECH_MAP, RESEARCH_QUEUE_CAP),
    autoResearch: saved.autoResearch ?? false,
    activePolicies: normalizeKnownIds(saved.activePolicies, POLICY_MAP, SAVE_ID_ARRAY_CAP),
    securityWings: saved.securityWings ?? fresh.securityWings,
    megacityRoster: normalizeMegacityRoster(saved.megacityRoster ?? fresh.megacityRoster),
    externalMegacities: (() => {
      const savedCities = Array.isArray(saved.externalMegacities) ? saved.externalMegacities : [];
      const savedById = new Map(savedCities.map((city: any) => [city?.id, city]));
      const freshIds = new Set(fresh.externalMegacities.map((city) => city.id));
      const refreshed = fresh.externalMegacities.map((freshCity: any) => {
        const savedCity = savedById.get(freshCity.id) ?? {};
        const merged = normalizeRelationshipScores({
          ...freshCity,
          ...savedCity,
          tradeInventory: normalizeTradeInventory(savedCity.tradeInventory, freshCity.tradeInventory),
          lastRefreshTick: savedCity.lastRefreshTick ?? 0,
          isActive: savedCity.isActive ?? freshCity.isActive ?? true,
        }, freshCity);
        return applyCanonicalContinuancePresentation(
          applyCanonicalLACityPresentation({
            ...merged,
            operational: operationalFromSettlement(merged, freshCity.operational),
          }),
        );
      });
      const legacyOnly = savedCities
        .filter((city: any) => city && !freshIds.has(city.id))
        .map((city: any) => {
          const normalized = normalizeRelationshipScores({
            ...city,
            tradeInventory: normalizeTradeInventory(city.tradeInventory),
          });
          return applyCanonicalContinuancePresentation({
            ...normalized,
            operational: operationalFromSettlement(normalized),
          });
        });
      const roster = normalizeMegacityRoster(saved.megacityRoster ?? fresh.megacityRoster);
      const names = new Map(roster.entries.map((entry) => [entry.id, entry.displayName]));
      return [...refreshed, ...legacyOnly].map((city) => {
        const name = names.get(city.id);
        return name ? { ...city, name } : city;
      });
    })(),
    tradeAgreements: (saved.tradeAgreements ?? []).filter((a: any) => a && a.id && a.status),
    jointProjects: (saved.jointProjects ?? []).filter((p: any) => p && p.id && p.status),
    diplomaticPacts: (saved.diplomaticPacts ?? []).filter((p: any) => p && p.id && p.status),
    militaryOverhaul: saved.militaryOverhaul
      ? (() => {
          // Task #381: logistics is a nested object with derived sub-records.
          // A shallow spread would replace the whole logistics block with an
          // older/partial save shape (missing newly-added fields), so deep-merge
          // logistics onto the fresh default. Derived scalars are recomputed on
          // the first tick; this only guarantees a valid shape for the UI to
          // read before that tick and preserves the neutral defaults.
          const base = createDefaultMilitaryState();
          const merged: any = { ...base, ...saved.militaryOverhaul };
          const sl = saved.militaryOverhaul.logistics ?? {};
          merged.logistics = {
            ...base.logistics,
            ...sl,
            suppliesTicksRemaining: { ...base.logistics.suppliesTicksRemaining, ...(sl.suppliesTicksRemaining ?? {}) },
            lastConsumption: { ...base.logistics.lastConsumption, ...(sl.lastConsumption ?? {}) },
            lastProduction: { ...base.logistics.lastProduction, ...(sl.lastProduction ?? {}) },
            installationsBuilt: { ...(sl.installationsBuilt ?? {}) },
            fleetCondition: { ...(sl.fleetCondition ?? {}) },
            fleetOperational: { ...(sl.fleetOperational ?? {}) },
          };
           const academies = saved.militaryOverhaul.academies ?? {};
           merged.academies = {
             ...base.academies,
             ...academies,
             facilities: { ...(academies.facilities ?? {}) },
             qualifications: { ...(academies.qualifications ?? {}) },
           };
          return merged;
        })()
      : undefined,
    politics: saved.politics ?? undefined,
    innerCircle: saved.innerCircle ?? undefined,
    intrigue: saved.intrigue ?? undefined,
    bodyguards: saved.bodyguards ?? undefined,
    softwareUpgrades: saved.softwareUpgrades ?? undefined,
    discoveredLocationIds: (() => {
      const ids = Array.isArray(saved.discoveredLocationIds) ? saved.discoveredLocationIds : [];
      const predatesHiddenContinuance = !Array.isArray(saved.externalMegacities)
        || !saved.externalMegacities.some((city) => city?.id === CONTINUANCE_ID);
      return predatesHiddenContinuance && !ids.includes(CONTINUANCE_ID)
        ? [...ids, CONTINUANCE_ID]
        : ids;
    })(),
    worldEventLog: (Array.isArray(saved.worldEventLog) ? saved.worldEventLog : []).map((entry) => ({
      ...entry,
      title: canonicalizeLegacyWorldIntelText(entry.title, entry.revealed),
      description: canonicalizeLegacyWorldIntelText(entry.description, entry.revealed),
    })),
    locationRelations: saved.locationRelations ?? {},
    eventTriggerCooldowns: saved.eventTriggerCooldowns ?? {},
    eventRecurrenceCounts: saved.eventRecurrenceCounts ?? {},
    // Legacy saves predate per-conflict war-event limits, so they begin with
    // no consumed occurrences rather than inheriting a fabricated war history.
    warEventOccurrences: saved.warEventOccurrences ?? {},
    // Task #480: reactive news feed — old saves default to an empty feed.
    newsFeed: saved.newsFeed ?? [],
    // Old saves used "verdant-enclave" for this preset, which collided with
    // the WORLD_LOCATIONS id of the same name. The starting-region preset is
    // now "region-verdant-enclave"; rewrite legacy values on load so old
    // saves keep their chosen start.
    startingRegion: (saved.startingRegion === "verdant-enclave"
      ? "region-verdant-enclave"
      : saved.startingRegion) ?? "city-core",
    playerCityPosition: saved.playerCityPosition ?? { ...DEFAULT_PLAYER_CITY_POSITION },
    strikeHistory: saved.strikeHistory ?? [],
    savedLoadouts: saved.savedLoadouts ?? {},
    factions: saved.factions && saved.factions.length > 0
      ? (() => {
          const savedIds = new Set(saved.factions.map((f: any) => f.id));
          const merged = saved.factions.map((f: any) => {
            const freshFaction = fresh.factions.find((ff: any) => ff.id === f.id);
            return {
              ...freshFaction ?? {},
              ...f,
              // New faction identity metadata is safe to backfill because it
              // is descriptive, not player progress. Nullish fallback also
              // keeps older saves from erasing a catalog identity.
              scope: f.scope ?? freshFaction?.scope,
              color: f.color ?? freshFaction?.color,
              domains: f.domains ?? freshFaction?.domains,
              mechanicalRole: f.mechanicalRole ?? freshFaction?.mechanicalRole,
              institutionalPresence: f.institutionalPresence ?? freshFaction?.institutionalPresence,
              approval: f.approval ?? 50,
              influence: f.influence ?? 50,
              isActive: f.isActive ?? true,
            };
          });
          for (const ff of fresh.factions) {
            if (!savedIds.has(ff.id)) merged.push(ff);
          }
          return merged;
        })()
      : fresh.factions,
    administrativeInstitutions:
      saved.administrativeInstitutions ?? fresh.administrativeInstitutions,
    resources: saved.resources ? { ...fresh.resources, ...saved.resources } : fresh.resources,
    // Task #562: repair pre-fix saves where the war-event generator piled up
    // duplicate copies of a static-id event (war_ceasefire_offer) — duplicate
    // ids collide as React keys and break EventCard interactivity. Keep the
    // FIRST (oldest) copy of each id so the event the player has been looking
    // at longest survives.
    activeEvents: dedupeActiveEventsById(saved.activeEvents ?? []),
    eventHistory: saved.eventHistory ?? [],
    immigrationBanned: saved.immigrationBanned ?? false,
    bordersClosed: saved.bordersClosed ?? false,
    tickPaused: saved.tickPaused ?? false,
    dailyStreak: saved.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null },
    weeklyChallenge: saved.weeklyChallenge,
    weeklyChallengesCompleted: saved.weeklyChallengesCompleted ?? 0,
    lastSeenVersion: saved.lastSeenVersion,
    personalGoals: saved.personalGoals,
    // Veterans coming from a save predating the first-run onboarding flag
    // skip the tutorial. Fresh saves carry `false` from createInitialState
    // and only flip to `true` once the player finishes or skips the flow.
    hasCompletedOnboarding: saved.hasCompletedOnboarding ?? true,
    // Walkthrough cursor — null for legacy saves and for completed runs.
    // Mid-flow saves preserve the player's beat so the layout gate can
    // resume them on the right screen.
    onboardingStep: saved.onboardingStep ?? null,
    // Per-beat completion flags. For veteran/legacy or already-finished
    // saves (hasCompletedOnboarding resolves to true), backfill all three
    // to true so any defensive code reading them sees a coherent shape.
    // Mid-flow and fresh saves preserve any persisted value, defaulting
    // to false. See engine/types.ts for the contract.
    didBuild: saved.didBuild ?? (saved.hasCompletedOnboarding ?? true),
    didEdict: saved.didEdict ?? (saved.hasCompletedOnboarding ?? true),
    didRead: saved.didRead ?? (saved.hasCompletedOnboarding ?? true),
    // One-time "nature crises easing" nudge baseline. Legacy saves predate this
    // field: backfill it from the save's CURRENT biosphere tier (via the same
    // shared getBiosphereCrisisRisk ramp the gauges use) rather than a constant,
    // so an already-recovered save does not fire a spurious "crises easing"
    // message on the first tick after load. A persisted value is preserved as-is
    // so the nudge stays idempotent across reloads. See tickProcessors
    // processBiosphere.
    lastSeenBiosphereCrisisTier:
      saved.lastSeenBiosphereCrisisTier ??
      getBiosphereCrisisRisk(Math.round(saved.cityStats?.biosphere ?? 20)).tier,
    // Task #367: same idempotent baseline for the per-stat "crossed into a better
    // band" advisories. Legacy saves predate these fields: backfill each from the
    // save's CURRENT band (via the shared statWinBands ramp) so an already-good
    // save does not fire a spurious win message on the first tick after load. A
    // persisted value is preserved as-is so the nudge stays idempotent across
    // reloads. See tickProcessors emitStatBandImprovements.
    lastSeenCrimeBandRank:
      saved.lastSeenCrimeBandRank ??
      computeStatBandRank(saved.cityStats, STAT_WIN_BAND_BY_KEY.crime),
    lastSeenHappinessBandRank:
      saved.lastSeenHappinessBandRank ??
      computeStatBandRank(saved.cityStats, STAT_WIN_BAND_BY_KEY.happiness),
    // Task #552: one-time prosperity-gate hint flag. Strict `=== true` so only
    // a save where the hint has genuinely fired keeps it suppressed; legacy
    // saves (field absent) default to "not shown", which is deliberate — an
    // established city currently blocked by the biosphere/housing terms is
    // exactly the audience the hint exists for. Firing is still gated on the
    // blocked condition itself, so an already-thriving legacy save never sees it.
    prosperityGateHintShown: saved.prosperityGateHintShown === true,
    prosperityGateRecoveryCelebrated: saved.prosperityGateRecoveryCelebrated === true,
    // Starter-objective marker (new-player objective marker). STRICT opt-in:
    // only a save that explicitly carries `true` (a fresh/guided game created
    // after this field shipped) keeps the marker. Legacy saves (field absent)
    // and veteran starts (explicit `false`) resolve to off — never a fresh-
    // state fallback, or the marker would wrongly light up for veterans and
    // low-tick legacy saves. Dismissal safely defaults to `false`.
    starterObjectivesActive: saved.starterObjectivesActive === true,
    starterObjectivesDismissed: saved.starterObjectivesDismissed ?? false,
    // Coach-tip-on-unlock opt-in: strict `=== true` for the same reason as the
    // starter objectives above — legacy saves (field absent) and veteran starts
    // (explicit `false`) resolve to off so coach tips never light up for
    // veterans or low-tick legacy saves. See engine/hudCoachTips.ts.
    hudCoachTipsActive: saved.hudCoachTipsActive === true,
    // Calm-start window length. Preserve a persisted numeric value (guided saves
    // carry the default; veteran starts carry 0); legacy saves (field absent)
    // resolve to undefined and the calmStart helper falls back to
    // CALM_START_TICKS — harmless since they are long past it. See
    // engine/calmStart.ts.
    calmStartTicks: typeof saved.calmStartTicks === "number" ? saved.calmStartTicks : undefined,
    // Auto-Manager Foundations: legacy saves predate this slice. Backfill
    // an empty/all-OFF state so engine/autoManagers.ts can read it without
    // the per-call `?? createDefaultAutoManagerState()` dance. Defensive
    // deep-merge: also normalize partial / malformed subfields inside an
    // existing slice so a corrupted save can't crash the UI.
    // Auto-Hire Recruitment (Task #123): backfill defensively. Old
    // saves predate this slice; corrupted slices are normalized so the
    // tick processor and UI can read it without per-call fallbacks.
    autoRecruit: (() => {
      const ar = saved.autoRecruit ?? null;
      const def: AutoRecruitConfig = createDefaultAutoRecruitConfig();
      if (!ar || typeof ar !== "object") return def;
      // Migrate old saves that used absolute targetTroopCount (Task #123
      // pre-revision). Convert to a sensible default % rather than a
      // brittle ratio against an unknown roster cap.
      const pct = typeof ar.targetStrengthPercent === "number"
        ? Math.max(0, Math.min(100, ar.targetStrengthPercent))
        : def.targetStrengthPercent;
      // Filter classPriority against known troop class IDs so corrupted
      // saves (renamed/removed classes, hand-edited JSON) don't silently
      // disable auto-hiring by pointing at unknown IDs.
      const knownClassIds = new Set<string>(CLASS_DEFS.map((c) => c.id));
      const filteredPriority: TroopClassId[] = Array.isArray(ar.classPriority)
        ? ar.classPriority.filter((id): id is TroopClassId =>
            typeof id === "string" && knownClassIds.has(id),
          )
        : [];
      return {
        budgetPerTick: (() => {
          // Backward-compat: pre-rename saves stored `budgetPerTick`.
          const legacy = (ar as { budgetPerTick?: unknown }).budgetPerTick;
          if (typeof ar.budgetPerTick === "number" && ar.budgetPerTick >= 0) return ar.budgetPerTick;
          if (typeof legacy === "number" && legacy >= 0) return legacy;
          return def.budgetPerTick;
        })(),
        targetStrengthPercent: pct,
        classPriority: filteredPriority.length > 0 ? filteredPriority : def.classPriority,
        lastRecruitTick: typeof ar.lastRecruitTick === "number" ? ar.lastRecruitTick : 0,
      };
    })(),
    // Task #131: per-domain auto-manager configs. Legacy saves predate this
    // slice — backfill defaults. Existing slices are kept; missing domains
    // are filled in by getDomainConfig's per-call fallback at runtime.
    autoDomains: (() => {
      const def = createDefaultAutoDomainConfigs();
      const ad = saved.autoDomains;
      if (!ad || typeof ad !== "object") return def;
      const merged: typeof def = { ...def };
      for (const [k, v] of Object.entries(ad)) {
        if (v && typeof v === "object" && k in def) {
          merged[k as keyof typeof def] = {
            budgetPerTick: typeof v.budgetPerTick === "number" && v.budgetPerTick >= 0 ? v.budgetPerTick : def[k as keyof typeof def]!.budgetPerTick,
            target: typeof v.target === "number" && v.target >= 0 ? v.target : def[k as keyof typeof def]!.target,
            priority: Array.isArray(v.priority) ? v.priority.filter((p): p is string => typeof p === "string") : def[k as keyof typeof def]!.priority,
            lastTick: typeof v.lastTick === "number" ? v.lastTick : 0,
          };
        }
      }
      return merged;
    })(),
    // Task #129: legacy saves backfill with even (1/N) shares, all-Tolerate, no Leader Cult.
    // Task #208: faith roster is now extensible — build records via FAITH_IDS.reduce
    // so adding a new faith only requires editing FAITH_IDS / FAITH_DEFS.
    faiths: (() => {
      const even = FAITH_IDS.reduce((acc, id) => {
        acc[id] = 1 / FAITH_IDS.length;
        return acc;
      }, {} as DistrictFaithShares);
      const evenDistrictShares: Record<string, DistrictFaithShares> = {};
      for (const d of fresh.districts) {
        evenDistrictShares[d.id] = { ...even };
      }
      const defStances = FAITH_IDS.reduce((acc, id) => {
        acc[id] = "tolerate";
        return acc;
      }, {} as FaithState["stances"]);
      const def: FaithState = {
        stances: defStances,
        districtShares: evenDistrictShares,
        leaderCult: null,
      };
      const raw = (saved as { faiths?: unknown }).faiths;
      if (!raw || typeof raw !== "object") return def;
      const r = raw as Partial<FaithState>;
      const stances: FaithState["stances"] = { ...def.stances };
      if (r.stances && typeof r.stances === "object") {
        for (const id of FAITH_IDS) {
          const v = (r.stances as Record<string, unknown>)[id];
          if (isFaithStance(v)) stances[id] = v as FaithStance;
        }
      }
      const districtShares: Record<string, DistrictFaithShares> = { ...def.districtShares };
      if (r.districtShares && typeof r.districtShares === "object") {
        for (const [dId, raw2] of Object.entries(r.districtShares as Record<string, unknown>)) {
          if (!districtShares[dId]) continue; // unknown district — skip
          if (!raw2 || typeof raw2 !== "object") continue;
          const rs = raw2 as Partial<DistrictFaithShares>;
          // For pre-#208 saves, missing faith keys are seeded to the default
          // even-baseline share for THIS district (1/N) rather than 0 — so the
          // newly added faiths arrive at a true neutral starting point instead
          // of being permanently zeroed out by normalize.
          const baseline = def.districtShares[dId];
          const merged = FAITH_IDS.reduce((acc, id) => {
            acc[id] = typeof rs[id] === "number" ? (rs[id] as number) : (baseline?.[id] ?? 0);
            return acc;
          }, {} as DistrictFaithShares);
          districtShares[dId] = normalizeShares(merged);
        }
      }
      let leaderCult: FaithState["leaderCult"] = null;
      const lc = r.leaderCult;
      if (lc && typeof lc === "object" && isFaithId((lc as { faithId?: unknown }).faithId)) {
        const tickRaw = (lc as { declaredAtTick?: unknown }).declaredAtTick;
        leaderCult = {
          faithId: (lc as { faithId: import("@/engine/faiths").FaithId }).faithId,
          declaredAtTick: typeof tickRaw === "number" ? tickRaw : 0,
        };
      }
      // Preserve renunciation cooldown across save/load so reload cannot bypass it.
      const lastRen = (r as { lastRenouncedAtTick?: unknown }).lastRenouncedAtTick;
      const out: FaithState = { stances, districtShares, leaderCult };
      if (typeof lastRen === "number" && Number.isFinite(lastRen) && lastRen >= 0) {
        out.lastRenouncedAtTick = lastRen;
      }
      return out;
    })(),
    autoManagers: (() => {
      const am = (saved.autoManagers ?? null) as Partial<NonNullable<typeof saved.autoManagers>> | null;
      return {
        modes: am && typeof am.modes === "object" && am.modes ? am.modes : {},
        queue: Array.isArray(am?.queue) ? am!.queue : [],
        pauseAllAct: am?.pauseAllAct === true,
        alwaysAllow: Array.isArray(am?.alwaysAllow) ? am!.alwaysAllow : [],
        snoozedKinds: Array.isArray(am?.snoozedKinds) ? am!.snoozedKinds : [],
        lastDecisionTick: am && typeof am.lastDecisionTick === "object" && am.lastDecisionTick ? am.lastDecisionTick : {},
      };
    })(),
  };
  // The legacy settlement ID remains stable for save compatibility, but its
  // public identity changed from the fictional Dusthaven entry to Mexico
  // City. Preserve mutable relationship state while refreshing the catalog
  // presentation and institutional counterpart on old saves.
  migrated.townships = (migrated.townships ?? []).map((township: any) => {
    const current = fresh.townships?.find((candidate: any) => candidate.id === township.id);
    if (township.id !== "dusthaven") {
      const normalized = normalizeRelationshipScores(township, current);
      return {
        ...normalized,
        tradeInventory: normalizeTradeInventory(township.tradeInventory, current?.tradeInventory),
        operational: operationalFromSettlement(normalized, current?.operational),
      };
    }
    if (!current) return township;
    const presentation = { ...township, ...current };
    const normalized = normalizeRelationshipScores({
      ...township,
      name: current.name,
      description: current.description,
      population: current.population,
      threat: current.threat,
      influence: current.influence,
      factionType: current.factionType,
      specialization: current.specialization,
      tradeInventory: normalizeTradeInventory(township.tradeInventory, current.tradeInventory),
      leader: current.leader,
      voiceLines: current.voiceLines,
      operational: operationalFromSettlement(presentation, current.operational),
    }, current);
    return {
      ...normalized,
    };
  });
  // Cohorts are derived, not player-authored. Backfill the nested snapshot
  // for old saves without changing any population or capacity values.
  migrated.demographics.populationCohorts = computePopulationCohorts(migrated);
  migrated.coerciveBacklashLog = normalizeCoerciveBacklashLog(saved.coerciveBacklashLog);
  migrated.infrastructureLedger = sanitizeInfrastructureLedger(
    saved.infrastructureLedger,
    migrated,
    migrated.cityStats.infrastructureHealth,
  );
  migrated.cityStats.infrastructureHealth = infrastructureHealthPercent(migrated.infrastructureLedger);
  return scrubLegacyContent(sanitizeRetiredEvents(migrated));
}
