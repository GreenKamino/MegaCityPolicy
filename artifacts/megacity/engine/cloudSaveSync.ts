import { computeChecksum, unwrapSave } from "./saveLoad";

// ─── STEAM CLOUD SAVE RECONCILIATION ────────────────────────────────────
//
// The Steam Cloud bridge (steamBridge.ts) can already read and write per-slot
// save bytes, and GameContext pushes local saves to the cloud and pulls them
// when the local copy is missing. What was missing was *conflict handling*:
// when a player moves between machines (desktop ↔ Steam Deck) both the local
// and the cloud copy of a slot can advance independently. Without a way to
// tell "cloud is simply newer" apart from "both sides changed since they were
// last in sync", the game would either silently overwrite progress or load an
// older save — among the most damaging launch complaints.
//
// This module is the pure, node-testable core of that reconciliation:
//   • readEnvelopeMeta — extract a comparable identity (checksum + timestamp)
//     from a wrapped slot blob.
//   • reconcileSlot — decide, given local + cloud + a last-synced baseline,
//     whether to push, pull, leave alone, or surface a conflict.
//   • baseline helpers — persist, per slot key, the checksum that local and
//     cloud last agreed on. The baseline is what lets us distinguish a clean
//     one-sided change from a genuine two-sided divergence.
//
// It deliberately imports nothing from react-native (steamBridge does), so the
// engine's node-only vitest runs can exercise it directly. GameContext injects
// the actual storage / cloud IO around these pure decisions.

/** Comparable identity for one slot's wrapped save blob. */
export interface SaveEnvelopeMeta {
  /** Checksum of the *inner* (decompressed) JSON — the lineage identity. */
  checksum: string;
  /** Wall-clock ms of the last tick written into the save (for display + tiebreak). */
  lastTickTime: number;
  /** False when the blob failed its checksum or its inner JSON won't parse. */
  valid: boolean;
  /** Best-effort display fields — never used for decisions, only the prompt. */
  cityName?: string;
  totalTicks?: number;
}

/** Per-slot record of the checksum local and cloud last agreed on.
 *  An entry with `deleted: true` is a deletion tombstone: the player removed
 *  this slot locally and the cloud copy must be deleted too, not pulled back. */
export type SyncBaseline = Record<
  string,
  { checksum: string; syncedAt: number; deleted?: boolean }
>;

/** AsyncStorage key under which the baseline map is persisted locally. */
export const CLOUD_SYNC_BASELINE_KEY = "@megacity_cloud_sync_baseline";

export type ReconcileAction =
  /** Neither side has data for this slot. */
  | "none"
  /** Both sides carry byte-identical lineage — nothing to do. */
  | "in-sync"
  /** Local is authoritative — upload it to the cloud. */
  | "push-local"
  /** Cloud is authoritative — download it over local. */
  | "pull-cloud"
  /** Both sides changed independently — the player must choose. */
  | "conflict"
  /** The slot was deleted locally — delete the cloud copy instead of pulling it. */
  | "push-delete";

export interface ReconcileDecision {
  action: ReconcileAction;
  local: SaveEnvelopeMeta | null;
  cloud: SaveEnvelopeMeta | null;
}

/**
 * Minimal storage surface the baseline helpers need. AsyncStorage satisfies
 * it directly; tests pass a Map-backed mock.
 */
export interface BaselineStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * Parse a wrapped slot blob into a comparable identity. Returns null only for
 * empty input — a corrupt-but-present blob still yields a (valid=false) meta so
 * two identical corrupt copies compare equal and a valid side can win over an
 * invalid one.
 */
export function readEnvelopeMeta(raw: string | null | undefined): SaveEnvelopeMeta | null {
  if (!raw) return null;
  let json: string;
  try {
    json = unwrapSave(raw).json;
  } catch {
    // Even a totally malformed wrapper still has *some* bytes; hash them so an
    // identical malformed blob on the other side compares equal.
    return { checksum: computeChecksum(raw), lastTickTime: 0, valid: false };
  }
  try {
    const parsed = JSON.parse(json) as {
      lastTickTime?: unknown;
      cityName?: unknown;
      totalTicks?: unknown;
    };
    const lastTickTime =
      typeof parsed.lastTickTime === "number" && Number.isFinite(parsed.lastTickTime)
        ? parsed.lastTickTime
        : 0;
    return {
      checksum: computeChecksum(json),
      lastTickTime,
      valid: true,
      cityName: typeof parsed.cityName === "string" ? parsed.cityName : undefined,
      totalTicks: typeof parsed.totalTicks === "number" ? parsed.totalTicks : undefined,
    };
  } catch {
    return { checksum: computeChecksum(json), lastTickTime: 0, valid: false };
  }
}

/**
 * Decide what to do with one slot given the local copy, the cloud copy, and
 * the checksum the two last agreed on (null when we've never recorded a sync
 * for this slot).
 *
 * The baseline is the crux of safe conflict detection: with it we can prove
 * which side changed since the last agreement; without it we can't, so we err
 * toward a conflict prompt rather than risk silently discarding progress.
 *
 * `deletedLocally` is the deletion-tombstone flag: the player deleted this
 * slot on this device. Without it, "local missing + cloud present" is
 * indistinguishable from a fresh-device install, so a deleted save would be
 * pulled straight back down — the resurrection bug. A tombstone only matters
 * while local stays empty; once a new local save exists in the slot, normal
 * reconciliation resumes (writing a save overwrites the tombstone anyway).
 */
export function reconcileSlot(
  local: SaveEnvelopeMeta | null,
  cloud: SaveEnvelopeMeta | null,
  baselineChecksum: string | null,
  deletedLocally: boolean = false,
): ReconcileDecision {
  if (!local && !cloud) return { action: "none", local, cloud };
  if (local && !cloud) return { action: "push-local", local, cloud };
  if (!local && cloud) {
    return { action: deletedLocally ? "push-delete" : "pull-cloud", local, cloud };
  }

  const l = local as SaveEnvelopeMeta;
  const c = cloud as SaveEnvelopeMeta;

  // Identical lineage — already agree.
  if (l.checksum === c.checksum) return { action: "in-sync", local, cloud };

  // One side is corrupt: prefer the readable copy rather than asking the
  // player to choose between a good save and garbage.
  if (l.valid && !c.valid) return { action: "push-local", local, cloud };
  if (!l.valid && c.valid) return { action: "pull-cloud", local, cloud };

  if (baselineChecksum) {
    const localMatches = l.checksum === baselineChecksum;
    const cloudMatches = c.checksum === baselineChecksum;
    // Local untouched since last sync, cloud advanced → take cloud.
    if (localMatches && !cloudMatches) return { action: "pull-cloud", local, cloud };
    // Cloud untouched since last sync, local advanced → take local.
    if (cloudMatches && !localMatches) return { action: "push-local", local, cloud };
    // Both moved away from the agreed point → genuine conflict.
    return { action: "conflict", local, cloud };
  }

  // No recorded baseline (first reconcile after this feature shipped, or a
  // fresh device that somehow has both copies). We can't prove ancestry, and
  // the cardinal rule is never to silently overwrite either side, so any
  // genuine content difference becomes a conflict for the player to resolve.
  return { action: "conflict", local, cloud };
}

/** Load the persisted baseline map; returns {} on missing/corrupt. */
export async function loadSyncBaseline(storage: BaselineStorage): Promise<SyncBaseline> {
  try {
    const raw = await storage.getItem(CLOUD_SYNC_BASELINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SyncBaseline = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const checksum = (v as { checksum?: unknown }).checksum;
        const syncedAt = (v as { syncedAt?: unknown }).syncedAt;
        const deleted = (v as { deleted?: unknown }).deleted;
        if (typeof checksum === "string") {
          out[k] = {
            checksum,
            syncedAt: typeof syncedAt === "number" ? syncedAt : 0,
            ...(deleted === true ? { deleted: true } : {}),
          };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the baseline map. Best-effort — failures are swallowed. */
export async function saveSyncBaseline(
  storage: BaselineStorage,
  baseline: SyncBaseline,
): Promise<void> {
  try {
    await storage.setItem(CLOUD_SYNC_BASELINE_KEY, JSON.stringify(baseline));
  } catch {
    /* baseline is a hint; a write failure only risks a spurious future prompt */
  }
}

/** Read the agreed checksum for a slot, or null if none recorded. A deletion
 *  tombstone carries no agreed lineage, so it also reads as null. */
export function getBaselineChecksum(baseline: SyncBaseline, slotKey: string): string | null {
  const entry = baseline[slotKey];
  if (!entry || entry.deleted) return null;
  return entry.checksum || null;
}

/** True when the slot carries a deletion tombstone: it was deleted locally
 *  and the cloud copy (if any) should be deleted, never pulled back. */
export function hasDeletionTombstone(baseline: SyncBaseline, slotKey: string): boolean {
  return baseline[slotKey]?.deleted === true;
}

/**
 * Mark `slotKey` as locally deleted. Recorded BEFORE the cloud delete is
 * attempted so a crash, offline window, or failed Steam call can never leave
 * the cloud copy looking like "newer data this device is missing". Cleared by
 * clearSyncBaseline once the cloud delete succeeds, or overwritten by
 * recordSyncBaseline when a new save lands in the slot. Best-effort; never throws.
 */
export async function recordDeletionTombstone(
  storage: BaselineStorage,
  slotKey: string,
): Promise<void> {
  const baseline = await loadSyncBaseline(storage);
  baseline[slotKey] = { checksum: "", syncedAt: Date.now(), deleted: true };
  await saveSyncBaseline(storage, baseline);
}

/**
 * Record that `slotKey` is now synced at the lineage of `wrappedRaw`. Reads,
 * updates, and writes the baseline map. Best-effort; never throws.
 */
export async function recordSyncBaseline(
  storage: BaselineStorage,
  slotKey: string,
  wrappedRaw: string,
): Promise<void> {
  const meta = readEnvelopeMeta(wrappedRaw);
  if (!meta) return;
  const baseline = await loadSyncBaseline(storage);
  baseline[slotKey] = { checksum: meta.checksum, syncedAt: Date.now() };
  await saveSyncBaseline(storage, baseline);
}

/**
 * Record a sync baseline for `slotKey` ONLY if the slot does not currently
 * carry a deletion tombstone. Returns true when the baseline was recorded,
 * false when a tombstone blocked it.
 *
 * This is the apply-side guard for the delete-during-reconcile race: the
 * startup reconcile decides "pull" or "push" for a slot, then awaits IO. If
 * the player deletes that slot in the gap, deleteSlot records a tombstone —
 * and a plain recordSyncBaseline afterwards would OVERWRITE that tombstone,
 * leaving the cloud copy looking like fresh data to pull back down (the
 * resurrection bug, through the back door). Refusing to record keeps the
 * tombstone alive so the next reconcile push-deletes the cloud copy instead.
 * Must be called under the same lock that serializes tombstone writes.
 */
export async function recordSyncBaselineUnlessDeleted(
  storage: BaselineStorage,
  slotKey: string,
  wrappedRaw: string,
): Promise<boolean> {
  const meta = readEnvelopeMeta(wrappedRaw);
  if (!meta) return false;
  const baseline = await loadSyncBaseline(storage);
  if (baseline[slotKey]?.deleted === true) return false;
  baseline[slotKey] = { checksum: meta.checksum, syncedAt: Date.now() };
  await saveSyncBaseline(storage, baseline);
  return true;
}

/** Drop a slot's baseline entry (e.g. when the slot is deleted). */
export async function clearSyncBaseline(
  storage: BaselineStorage,
  slotKey: string,
): Promise<void> {
  const baseline = await loadSyncBaseline(storage);
  if (slotKey in baseline) {
    delete baseline[slotKey];
    await saveSyncBaseline(storage, baseline);
  }
}

/**
 * Drop the baseline entries for a batch of slot keys in ONE
 * read-modify-write pass. Used when deleting a whole commander profile on a
 * non-Steam build: no cloud copy can exist, so the entries (including any
 * stale tombstones) are pure orphans — a future profile that happened to
 * collide with a recycled slot key would otherwise inherit a bogus lineage.
 * Callers on the GameContext side must hold the baseline lock, same as
 * clearSyncBaseline. Best-effort; never throws.
 */
export async function clearSyncBaselines(
  storage: BaselineStorage,
  slotKeys: readonly string[],
): Promise<void> {
  const baseline = await loadSyncBaseline(storage);
  let changed = false;
  for (const key of slotKeys) {
    if (key in baseline) {
      delete baseline[key];
      changed = true;
    }
  }
  if (changed) await saveSyncBaseline(storage, baseline);
}
