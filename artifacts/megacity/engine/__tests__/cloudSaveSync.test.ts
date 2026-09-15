import { beforeEach, describe, expect, it } from "vitest";

import { wrapSave } from "@/engine/saveLoad";
import {
  CLOUD_SYNC_BASELINE_KEY,
  clearSyncBaseline,
  getBaselineChecksum,
  hasDeletionTombstone,
  loadSyncBaseline,
  readEnvelopeMeta,
  reconcileSlot,
  recordDeletionTombstone,
  recordSyncBaseline,
  recordSyncBaselineUnlessDeleted,
  saveSyncBaseline,
  type BaselineStorage,
} from "@/engine/cloudSaveSync";

// Minimal Map-backed BaselineStorage for the baseline helper tests.
function makeStorage(): BaselineStorage & { _map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    _map: map,
    getItem: async (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: async (k: string, v: string) => { map.set(k, v); },
  };
}

// Build a wrapped slot blob from a partial state so readEnvelopeMeta can parse
// real lineage out of it. lastTickTime drives the display tiebreak.
function makeSave(opts: { cityName?: string; lastTickTime?: number; totalTicks?: number; extra?: Record<string, unknown> }): string {
  const json = JSON.stringify({
    cityName: opts.cityName ?? "Test City",
    lastTickTime: opts.lastTickTime ?? 1000,
    totalTicks: opts.totalTicks ?? 10,
    ...(opts.extra ?? {}),
  });
  return wrapSave(json);
}

describe("readEnvelopeMeta", () => {
  it("returns null for empty input", () => {
    expect(readEnvelopeMeta(null)).toBeNull();
    expect(readEnvelopeMeta(undefined)).toBeNull();
    expect(readEnvelopeMeta("")).toBeNull();
  });

  it("extracts checksum, timestamp, and display fields from a valid blob", () => {
    const meta = readEnvelopeMeta(makeSave({ cityName: "Neo Kyoto", lastTickTime: 5000, totalTicks: 42 }));
    expect(meta).not.toBeNull();
    expect(meta!.valid).toBe(true);
    expect(meta!.lastTickTime).toBe(5000);
    expect(meta!.cityName).toBe("Neo Kyoto");
    expect(meta!.totalTicks).toBe(42);
    expect(meta!.checksum).toBeTruthy();
  });

  it("identical inner JSON yields identical checksums", () => {
    const a = readEnvelopeMeta(makeSave({ cityName: "Same", lastTickTime: 1, totalTicks: 2 }));
    const b = readEnvelopeMeta(makeSave({ cityName: "Same", lastTickTime: 1, totalTicks: 2 }));
    expect(a!.checksum).toBe(b!.checksum);
  });

  it("different inner JSON yields different checksums", () => {
    const a = readEnvelopeMeta(makeSave({ lastTickTime: 1 }));
    const b = readEnvelopeMeta(makeSave({ lastTickTime: 2 }));
    expect(a!.checksum).not.toBe(b!.checksum);
  });

  it("marks a corrupt blob invalid but still returns a comparable meta", () => {
    const meta = readEnvelopeMeta("not-json-at-all");
    expect(meta).not.toBeNull();
    expect(meta!.valid).toBe(false);
    expect(meta!.checksum).toBeTruthy();
  });

  it("two identical corrupt blobs compare equal", () => {
    const a = readEnvelopeMeta("garbage");
    const b = readEnvelopeMeta("garbage");
    expect(a!.checksum).toBe(b!.checksum);
  });
});

describe("reconcileSlot", () => {
  const local = readEnvelopeMeta(makeSave({ cityName: "Local", lastTickTime: 100 }))!;
  const cloud = readEnvelopeMeta(makeSave({ cityName: "Cloud", lastTickTime: 200 }))!;

  it("none when neither side has data", () => {
    expect(reconcileSlot(null, null, null).action).toBe("none");
  });

  it("push-local when only local exists", () => {
    expect(reconcileSlot(local, null, null).action).toBe("push-local");
  });

  it("pull-cloud when only cloud exists", () => {
    expect(reconcileSlot(null, cloud, null).action).toBe("pull-cloud");
  });

  it("in-sync when both sides are byte-identical", () => {
    const same = readEnvelopeMeta(makeSave({ cityName: "X", lastTickTime: 1 }))!;
    const sameAgain = readEnvelopeMeta(makeSave({ cityName: "X", lastTickTime: 1 }))!;
    expect(reconcileSlot(same, sameAgain, null).action).toBe("in-sync");
  });

  it("prefers the valid copy when one side is corrupt", () => {
    const corrupt = readEnvelopeMeta("garbage")!;
    expect(reconcileSlot(local, corrupt, null).action).toBe("push-local");
    expect(reconcileSlot(corrupt, cloud, null).action).toBe("pull-cloud");
  });

  it("pull-cloud when local unchanged since baseline but cloud advanced", () => {
    const decision = reconcileSlot(local, cloud, local.checksum);
    expect(decision.action).toBe("pull-cloud");
  });

  it("push-local when cloud unchanged since baseline but local advanced", () => {
    const decision = reconcileSlot(local, cloud, cloud.checksum);
    expect(decision.action).toBe("push-local");
  });

  it("conflict when both sides moved away from the baseline", () => {
    const baseline = readEnvelopeMeta(makeSave({ cityName: "Ancestor", lastTickTime: 50 }))!;
    const decision = reconcileSlot(local, cloud, baseline.checksum);
    expect(decision.action).toBe("conflict");
  });

  it("conflict when both differ and there is no baseline (cannot prove ancestry)", () => {
    const decision = reconcileSlot(local, cloud, null);
    expect(decision.action).toBe("conflict");
  });
});

describe("baseline persistence", () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); });

  it("loadSyncBaseline returns {} when nothing is stored", async () => {
    expect(await loadSyncBaseline(storage)).toEqual({});
  });

  it("loadSyncBaseline returns {} on corrupt JSON", async () => {
    await storage.setItem(CLOUD_SYNC_BASELINE_KEY, "{not json");
    expect(await loadSyncBaseline(storage)).toEqual({});
  });

  it("recordSyncBaseline persists the inner checksum for a slot", async () => {
    const raw = makeSave({ cityName: "Recorded", lastTickTime: 7 });
    await recordSyncBaseline(storage, "@slot_1", raw);
    const baseline = await loadSyncBaseline(storage);
    const meta = readEnvelopeMeta(raw)!;
    expect(getBaselineChecksum(baseline, "@slot_1")).toBe(meta.checksum);
  });

  it("getBaselineChecksum returns null for an unknown slot", async () => {
    const baseline = await loadSyncBaseline(storage);
    expect(getBaselineChecksum(baseline, "@slot_missing")).toBeNull();
  });

  it("clearSyncBaseline removes only the targeted slot", async () => {
    await recordSyncBaseline(storage, "@slot_1", makeSave({ lastTickTime: 1 }));
    await recordSyncBaseline(storage, "@slot_2", makeSave({ lastTickTime: 2 }));
    await clearSyncBaseline(storage, "@slot_1");
    const baseline = await loadSyncBaseline(storage);
    expect(getBaselineChecksum(baseline, "@slot_1")).toBeNull();
    expect(getBaselineChecksum(baseline, "@slot_2")).not.toBeNull();
  });

  it("saveSyncBaseline round-trips through loadSyncBaseline", async () => {
    await saveSyncBaseline(storage, { "@slot_3": { checksum: "abc", syncedAt: 123 } });
    const baseline = await loadSyncBaseline(storage);
    expect(getBaselineChecksum(baseline, "@slot_3")).toBe("abc");
  });
});

describe("end-to-end: baseline turns a one-sided change into a clean pull/push", () => {
  it("after recording a baseline, a cloud-only advance pulls instead of conflicts", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_slot_1";

    // Local and cloud start in sync at the same lineage.
    const synced = makeSave({ cityName: "Synced", lastTickTime: 100, totalTicks: 5 });
    await recordSyncBaseline(storage, slotKey, synced);

    const localMeta = readEnvelopeMeta(synced)!;          // local stayed put
    const cloudAdvanced = readEnvelopeMeta(makeSave({ cityName: "Synced", lastTickTime: 300, totalTicks: 9 }))!;

    const baseline = await loadSyncBaseline(storage);
    const decision = reconcileSlot(localMeta, cloudAdvanced, getBaselineChecksum(baseline, slotKey));
    expect(decision.action).toBe("pull-cloud");
  });

  it("without a baseline the same divergence is treated as a conflict", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_slot_1";

    const localMeta = readEnvelopeMeta(makeSave({ lastTickTime: 100 }))!;
    const cloudMeta = readEnvelopeMeta(makeSave({ lastTickTime: 300 }))!;

    const baseline = await loadSyncBaseline(storage);
    const decision = reconcileSlot(localMeta, cloudMeta, getBaselineChecksum(baseline, slotKey));
    expect(decision.action).toBe("conflict");
  });

  // Regression: the first post-feature launch finds local == cloud with NO
  // baseline yet. The startup reconcile must record a baseline for that
  // "in-sync" slot, otherwise a later one-sided cloud advance is misread as a
  // conflict instead of a clean pull. This models the GameContext flow:
  // 1) in-sync with no baseline -> record baseline, 2) cloud advances ->
  // reconcile must say pull-cloud.
  it("in-sync slot with no baseline records one, so a later cloud advance pulls (not conflicts)", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_slot_1";

    // First launch: identical local + cloud, no baseline recorded yet.
    const synced = makeSave({ cityName: "Synced", lastTickTime: 100, totalTicks: 5 });
    const localMeta1 = readEnvelopeMeta(synced)!;
    const cloudMeta1 = readEnvelopeMeta(synced)!;
    let baseline = await loadSyncBaseline(storage);
    const firstDecision = reconcileSlot(localMeta1, cloudMeta1, getBaselineChecksum(baseline, slotKey));
    expect(firstDecision.action).toBe("in-sync");

    // GameContext records a baseline on in-sync when none exists yet.
    expect(getBaselineChecksum(baseline, slotKey)).toBeNull();
    await recordSyncBaseline(storage, slotKey, synced);

    // Later launch on this device: cloud advanced elsewhere, local untouched.
    const cloudAdvanced = readEnvelopeMeta(makeSave({ cityName: "Synced", lastTickTime: 400, totalTicks: 12 }))!;
    baseline = await loadSyncBaseline(storage);
    const secondDecision = reconcileSlot(localMeta1, cloudAdvanced, getBaselineChecksum(baseline, slotKey));
    expect(secondDecision.action).toBe("pull-cloud");
  });
});

// ─── DELETION TOMBSTONES (Task: deleted saves must stay deleted) ─────────
//
// The resurrection bug: player deletes a slot, the cloud delete silently
// fails (offline / Steam hiccup), and the next launch reconcile sees
// "local missing + cloud present" — indistinguishable from a fresh device —
// so it pulls the deleted save right back down. A tombstone recorded at
// delete time is what breaks that ambiguity.
describe("deletion tombstones", () => {
  it("cloud-only slot WITH a tombstone reconciles as push-delete, not pull-cloud", () => {
    const cloud = readEnvelopeMeta(makeSave({ cityName: "Deleted City" }))!;
    const decision = reconcileSlot(null, cloud, null, true);
    expect(decision.action).toBe("push-delete");
  });

  it("cloud-only slot WITHOUT a tombstone still pulls (fresh-device restore intact)", () => {
    const cloud = readEnvelopeMeta(makeSave({ cityName: "Other Device City" }))!;
    const decision = reconcileSlot(null, cloud, null, false);
    expect(decision.action).toBe("pull-cloud");
  });

  it("both sides empty reconciles as none even with a tombstone (cleanup case)", () => {
    const decision = reconcileSlot(null, null, null, true);
    expect(decision.action).toBe("none");
  });

  it("a NEW local save in a tombstoned slot resumes normal reconciliation", () => {
    // Player deleted, then started a fresh city in the same slot before the
    // stale tombstone was cleared. The new local save must win normally.
    const local = readEnvelopeMeta(makeSave({ cityName: "Fresh City" }))!;
    expect(reconcileSlot(local, null, null, true).action).toBe("push-local");
    // Identical copies are in-sync regardless of the stale tombstone.
    const same = makeSave({ cityName: "Same City", lastTickTime: 7, totalTicks: 3 });
    const l = readEnvelopeMeta(same)!;
    const c = readEnvelopeMeta(same)!;
    expect(reconcileSlot(l, c, null, true).action).toBe("in-sync");
  });

  it("recordDeletionTombstone round-trips through storage and reads as no baseline", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_profile_p1_slot_2";
    await recordDeletionTombstone(storage, slotKey);
    const baseline = await loadSyncBaseline(storage);
    expect(hasDeletionTombstone(baseline, slotKey)).toBe(true);
    // A tombstone carries no agreed lineage — must not look like a checksum.
    expect(getBaselineChecksum(baseline, slotKey)).toBeNull();
    // Other slots are untouched.
    expect(hasDeletionTombstone(baseline, "@megacity_profile_p1_slot_3")).toBe(false);
  });

  it("clearSyncBaseline removes a tombstone (cloud delete confirmed)", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_slot_4";
    await recordDeletionTombstone(storage, slotKey);
    await clearSyncBaseline(storage, slotKey);
    const baseline = await loadSyncBaseline(storage);
    expect(hasDeletionTombstone(baseline, slotKey)).toBe(false);
  });

  it("recordSyncBaseline overwrites a stale tombstone when a new save lands", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_slot_5";
    await recordDeletionTombstone(storage, slotKey);
    const fresh = makeSave({ cityName: "New City", lastTickTime: 50 });
    await recordSyncBaseline(storage, slotKey, fresh);
    const baseline = await loadSyncBaseline(storage);
    expect(hasDeletionTombstone(baseline, slotKey)).toBe(false);
    expect(getBaselineChecksum(baseline, slotKey)).toBe(readEnvelopeMeta(fresh)!.checksum);
  });

  it("tombstones survive a save/load cycle of the baseline map", async () => {
    const storage = makeStorage();
    await recordDeletionTombstone(storage, "slotA");
    await recordSyncBaseline(storage, "slotB", makeSave({ cityName: "Kept" }));
    // Re-load from raw persisted bytes (fresh parse path).
    const reloaded = await loadSyncBaseline(storage);
    expect(hasDeletionTombstone(reloaded, "slotA")).toBe(true);
    expect(hasDeletionTombstone(reloaded, "slotB")).toBe(false);
    expect(getBaselineChecksum(reloaded, "slotB")).toBeTruthy();
  });
});

// The startup reconcile decides an action per slot, then awaits IO to apply
// it. If the player deletes that slot in the gap (only possible in the first
// seconds after launch or right after switching commanders), the apply must
// not clobber the fresh deletion tombstone — otherwise the just-deleted save
// gets pulled back down from the cloud on the next pass. These tests pin the
// two halves of the fix: the guarded baseline write, and the requirement to
// re-read the baseline per slot instead of trusting a pre-loop snapshot.
describe("delete during startup reconcile", () => {
  it("recordSyncBaselineUnlessDeleted refuses to overwrite a tombstone", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_profile_p1_slot_1";
    // Player deletes the slot mid-reconcile → tombstone lands first.
    await recordDeletionTombstone(storage, slotKey);
    // The in-flight reconcile then tries to record the baseline for the copy
    // it already read. The guard must refuse and keep the tombstone alive.
    const staleRaw = makeSave({ cityName: "Deleted City" });
    const recorded = await recordSyncBaselineUnlessDeleted(storage, slotKey, staleRaw);
    expect(recorded).toBe(false);
    const baseline = await loadSyncBaseline(storage);
    expect(hasDeletionTombstone(baseline, slotKey)).toBe(true);
    expect(getBaselineChecksum(baseline, slotKey)).toBeNull();
  });

  it("recordSyncBaselineUnlessDeleted records normally when no tombstone exists", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_profile_p1_slot_2";
    const raw = makeSave({ cityName: "Live City" });
    const recorded = await recordSyncBaselineUnlessDeleted(storage, slotKey, raw);
    expect(recorded).toBe(true);
    const baseline = await loadSyncBaseline(storage);
    expect(getBaselineChecksum(baseline, slotKey)).toBe(readEnvelopeMeta(raw)!.checksum);
  });

  it("a stale pre-delete baseline snapshot would pull; a fresh re-read push-deletes", async () => {
    // Full ordering of the original bug, at the engine level:
    // 1. Reconcile snapshots the baseline BEFORE the delete.
    const storage = makeStorage();
    const slotKey = "@megacity_profile_p1_slot_3";
    const cloudRaw = makeSave({ cityName: "Doomed City", lastTickTime: 999 });
    await recordSyncBaseline(storage, slotKey, cloudRaw);
    const staleSnapshot = await loadSyncBaseline(storage);

    // 2. Player deletes the slot: local copy gone, tombstone recorded.
    await recordDeletionTombstone(storage, slotKey);

    // 3a. BUG (stale snapshot): local=null, cloud present, no tombstone seen
    //     → pull-cloud, resurrecting the save.
    const cloudMeta = readEnvelopeMeta(cloudRaw);
    const staleDecision = reconcileSlot(
      null,
      cloudMeta,
      getBaselineChecksum(staleSnapshot, slotKey),
      hasDeletionTombstone(staleSnapshot, slotKey),
    );
    expect(staleDecision.action).toBe("pull-cloud"); // documents why the snapshot is unsafe

    // 3b. FIX (fresh per-slot re-read): the tombstone is visible
    //     → push-delete, removing the cloud copy instead.
    const fresh = await loadSyncBaseline(storage);
    const freshDecision = reconcileSlot(
      null,
      cloudMeta,
      getBaselineChecksum(fresh, slotKey),
      hasDeletionTombstone(fresh, slotKey),
    );
    expect(freshDecision.action).toBe("push-delete");
  });

  it("delete after a pull already applied still wins: tombstone survives the pull's baseline write", async () => {
    // Ordering: reconcile decided pull-cloud, wrote the local file, and is
    // about to record the baseline — but the delete landed in between.
    const storage = makeStorage();
    const slotKey = "@megacity_profile_p1_slot_4";
    const cloudRaw = makeSave({ cityName: "Pulled City" });
    await recordDeletionTombstone(storage, slotKey);
    const recorded = await recordSyncBaselineUnlessDeleted(storage, slotKey, cloudRaw);
    expect(recorded).toBe(false);
    // Next reconcile pass: local deleted (removed by deleteSlot), cloud still
    // present, tombstone intact → the cloud copy is deleted, not pulled.
    const fresh = await loadSyncBaseline(storage);
    const decision = reconcileSlot(
      null,
      readEnvelopeMeta(cloudRaw),
      getBaselineChecksum(fresh, slotKey),
      hasDeletionTombstone(fresh, slotKey),
    );
    expect(decision.action).toBe("push-delete");
  });

  it("conflict resolution cannot replace a tombstone before its next reconcile", async () => {
    const storage = makeStorage();
    const slotKey = "@megacity_profile_p1_slot_5";
    const localRaw = makeSave({ cityName: "Local Choice", lastTickTime: 100 });
    const cloudRaw = makeSave({ cityName: "Cloud Choice", lastTickTime: 200 });

    // A conflict prompt can outlive a concurrent delete. The delete records
    // its tombstone first; either stale resolution choice then tries to record
    // the winner's baseline and must be refused.
    await recordDeletionTombstone(storage, slotKey);
    const localRecorded = await recordSyncBaselineUnlessDeleted(storage, slotKey, localRaw);
    const cloudRecorded = await recordSyncBaselineUnlessDeleted(storage, slotKey, cloudRaw);
    expect(localRecorded).toBe(false);
    expect(cloudRecorded).toBe(false);

    // The preserved tombstone still turns the cloud copy into a delete retry,
    // rather than allowing the chosen conflict side to be pulled back later.
    const baseline = await loadSyncBaseline(storage);
    const decision = reconcileSlot(
      null,
      readEnvelopeMeta(cloudRaw),
      getBaselineChecksum(baseline, slotKey),
      hasDeletionTombstone(baseline, slotKey),
    );
    expect(decision.action).toBe("push-delete");
  });
});
