import { describe, expect, it, beforeEach } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  BACKUP_SUFFIX,
  TMP_SUFFIX,
  computeChecksum,
  migrateState,
  patchSlotSave,
  SaveWriteError,
  sweepStaleTmpKeys,
  unwrapSave,
  writeSlotRaw,
  writeSlotSave,
  wrapSave,
  type SlotStorage,
} from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import { compressToUTF16 } from "lz-string";
import type { GameState } from "@/engine/types";

// Pre-launch audit flagged that GameContext was performing direct
// AsyncStorage.setItem writes in several lifecycle paths (backgrounding,
// startNewGame, performRebirth, importSlot, importFullBackup, cloud
// restore, setSaveLabel, setHonorMode), bypassing the centralized save
// path and its backup-rotation semantics. Those writes have since been
// routed through writeSlotSave / writeSlotRaw / patchSlotSave in
// engine/saveLoad.ts. This suite exercises that contract end-to-end with
// a Map-backed mock storage so any regression that re-introduces a
// bypass — or breaks backup rotation — fails here, not in the wild.

class MockStorage implements SlotStorage {
  store = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

const SLOT_KEY = "@megacity_slot_1";

describe("centralized slot save helpers", () => {
  let storage: MockStorage;
  let state: GameState;

  beforeEach(() => {
    storage = new MockStorage();
    state = createInitialState();
  });

  it("writeSlotSave wraps and stores under the slot key", async () => {
    await writeSlotSave(storage, SLOT_KEY, state);
    const raw = storage.store.get(SLOT_KEY);
    expect(raw).toBeTruthy();
    const { json, valid } = unwrapSave(raw!);
    expect(valid).toBe(true);
    const parsed = JSON.parse(json) as GameState;
    expect(parsed.totalTicks).toBe(state.totalTicks);
  });

  it("loads an edited disposable browser fixture through the normal reload path and keeps the warning", () => {
    const sourceRaw = wrapSave(JSON.stringify(state));
    const edited = {
      ...state,
      totalTicks: state.totalTicks + 7,
      resources: {
        ...state.resources,
        credits: state.resources.credits + 123,
      },
    };

    const sourceEnvelope = JSON.parse(sourceRaw);
    // Match the browser fixture helper: valid compressed JSON with the source
    // checksum intentionally retained.
    const editedRaw = JSON.stringify({
      ...sourceEnvelope,
      data: compressToUTF16(JSON.stringify(edited)),
    });
    const editedEnvelope = JSON.parse(editedRaw);
    expect(editedEnvelope.checksum).toBe(sourceEnvelope.checksum);
    expect(editedEnvelope.data).not.toBe(sourceEnvelope.data);

    // This mirrors GameContext's production load sequence after a browser
    // reload. A parseable edited payload must not fall back to _backup.
    const unwrapped = unwrapSave(editedRaw);
    expect(unwrapped.valid).toBe(true);
    const reloaded = sanitizeState(
      migrateState(JSON.parse(unwrapped.json) as GameState),
    );
    expect(reloaded.totalTicks).toBe(edited.totalTicks);
    expect(reloaded.resources.credits).toBe(edited.resources.credits);
    expect(reloaded.integrityCompromised).toBe(true);

    // A normal save/reload keeps the durable mark even after the envelope is
    // repaired with a fresh checksum.
    const savedAgain = unwrapSave(wrapSave(JSON.stringify(reloaded)));
    expect(savedAgain.valid).toBe(true);
    const loadedAgain = JSON.parse(savedAgain.json) as GameState;
    expect(loadedAgain.totalTicks).toBe(edited.totalTicks);
    expect(loadedAgain.integrityCompromised).toBe(true);
  });

  it("persists recurrence counts through the save and load pipeline", async () => {
    const withRecurrences: GameState = {
      ...state,
      eventRecurrenceCounts: {
        biosphere_ecosystem_collapse: 3,
        officer_embezzlement: 2,
      },
    };

    await writeSlotSave(storage, SLOT_KEY, withRecurrences);
    const { json, valid } = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(valid).toBe(true);

    const reloaded = sanitizeState(migrateState(JSON.parse(json) as GameState));
    expect(reloaded.eventRecurrenceCounts).toEqual(withRecurrences.eventRecurrenceCounts);
  });

  it("writeSlotSave rotates an existing save into the _backup slot", async () => {
    // First write — no backup should be created (nothing to rotate).
    await writeSlotSave(storage, SLOT_KEY, state);
    expect(storage.store.has(SLOT_KEY + BACKUP_SUFFIX)).toBe(false);

    // Second write — the previous primary should now live under _backup.
    const v1Primary = storage.store.get(SLOT_KEY)!;
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 100 };
    await writeSlotSave(storage, SLOT_KEY, advanced);

    expect(storage.store.get(SLOT_KEY + BACKUP_SUFFIX)).toBe(v1Primary);
    const newPrimary = storage.store.get(SLOT_KEY)!;
    expect(newPrimary).not.toBe(v1Primary);
    const { json } = unwrapSave(newPrimary);
    expect((JSON.parse(json) as GameState).totalTicks).toBe(state.totalTicks + 100);
  });

  it("can recover from a corrupted primary using the _backup", async () => {
    // Simulate the real corruption-recovery path: write twice so backup
    // exists, then clobber the primary with garbage. The unwrapSave
    // contract is that primary is invalid → caller falls back to backup.
    await writeSlotSave(storage, SLOT_KEY, state);
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 50 };
    await writeSlotSave(storage, SLOT_KEY, advanced);

    storage.store.set(SLOT_KEY, "💥 NOT A SAVE 💥");

    const primaryRaw = (await storage.getItem(SLOT_KEY))!;
    const primary = unwrapSave(primaryRaw);
    expect(primary.valid).toBe(false);

    const backupRaw = (await storage.getItem(SLOT_KEY + BACKUP_SUFFIX))!;
    const backup = unwrapSave(backupRaw);
    expect(backup.valid).toBe(true);
    // Backup should hold the *previous* generation (the original state),
    // not the latest, because writeSlotSave rotates before overwriting.
    expect((JSON.parse(backup.json) as GameState).totalTicks).toBe(state.totalTicks);
  });

  it("writeSlotRaw stores opaque bytes verbatim and rotates backup", async () => {
    await writeSlotSave(storage, SLOT_KEY, state);
    const before = storage.store.get(SLOT_KEY)!;
    const cloudBlob = wrapSave(JSON.stringify({ ...state, totalTicks: 999 }));

    await writeSlotRaw(storage, SLOT_KEY, cloudBlob);

    expect(storage.store.get(SLOT_KEY)).toBe(cloudBlob);
    expect(storage.store.get(SLOT_KEY + BACKUP_SUFFIX)).toBe(before);
  });

  it("patchSlotSave applies field-level patches without losing data", async () => {
    await writeSlotSave(storage, SLOT_KEY, state);
    const ok = await patchSlotSave(storage, SLOT_KEY, (s) => {
      s.saveLabel = "Test Label";
      return s;
    });
    expect(ok).toBe(true);
    const { json, valid } = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(valid).toBe(true);
    const parsed = JSON.parse(json) as GameState;
    expect(parsed.saveLabel).toBe("Test Label");
    // Untouched fields must survive the patch round-trip.
    expect(parsed.totalTicks).toBe(state.totalTicks);
  });

  it("patchSlotSave returns false when the slot is empty", async () => {
    const ok = await patchSlotSave(storage, SLOT_KEY, (s) => s);
    expect(ok).toBe(false);
    expect(storage.store.has(SLOT_KEY)).toBe(false);
  });

  it("patchSlotSave returns false on unparseable payloads", async () => {
    storage.store.set(SLOT_KEY, "not-json-at-all");
    const ok = await patchSlotSave(storage, SLOT_KEY, (s) => s);
    expect(ok).toBe(false);
  });

  it("patchSlotSave accepts a checksum-mismatched but JSON-parseable payload, keeping the compromised mark", async () => {
    // Recovery semantics: when the wrapper envelope is well-formed and the
    // inner payload still parses as JSON, the save is NOT rejected — a
    // checksum mismatch over intact JSON is the hand-edited-save signature,
    // so unwrapSave hands it back as valid WITH integrityCompromised baked
    // in (see markTampered in saveLoad.ts). patchSlotSave then applies the
    // patch and rewrites the slot with a fresh, valid checksum — but the
    // compromised mark rides along in the state, so the tamper record is
    // permanent even after the envelope is "repaired". The previous primary
    // is still rotated into _backup so a future corruption can recover.
    await writeSlotSave(storage, SLOT_KEY, state);

    // Hand-craft a v2 envelope whose checksum does NOT match the inner
    // JSON. unwrapSave reports valid=true (payload intact) and injects the
    // integrityCompromised flag; patchSlotSave then parses and rewrites.
    const tamperedState: GameState = { ...state, totalTicks: state.totalTicks + 7 };
    const innerJson = JSON.stringify(tamperedState);
    const compressed = compressToUTF16(innerJson);
    const wrongChecksum = computeChecksum(innerJson + "tamper");
    const tamperedEnvelope = JSON.stringify({
      v: 2,
      checksum: wrongChecksum,
      data: compressed,
    });

    // Sanity: the envelope unwraps as loadable-but-flagged before we
    // exercise patchSlotSave.
    const probe = unwrapSave(tamperedEnvelope);
    expect(probe.valid).toBe(true);
    expect((JSON.parse(probe.json) as GameState).integrityCompromised).toBe(true);

    const v1Primary = storage.store.get(SLOT_KEY)!;
    storage.store.set(SLOT_KEY, tamperedEnvelope);

    const ok = await patchSlotSave(storage, SLOT_KEY, (s) => {
      s.saveLabel = "Repaired";
      return s;
    });
    expect(ok).toBe(true);

    // Primary is rewritten with a valid checksum and the patch applied —
    // and the compromised mark persists through the rewrite.
    const repaired = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(repaired.valid).toBe(true);
    const parsed = JSON.parse(repaired.json) as GameState;
    expect(parsed.saveLabel).toBe("Repaired");
    expect(parsed.totalTicks).toBe(state.totalTicks + 7);
    expect(parsed.integrityCompromised).toBe(true);

    // Backup-rotation semantics still hold: the tampered envelope is
    // what patchSlotSave saw as "current primary" at the moment of
    // rewrite, so it is what gets pushed into _backup. (The original
    // v1Primary from the very first writeSlotSave was overwritten by
    // our manual storage.store.set above and is intentionally gone —
    // assert that we did NOT silently resurrect it.)
    expect(storage.store.get(SLOT_KEY + BACKUP_SUFFIX)).toBe(tamperedEnvelope);
    expect(storage.store.get(SLOT_KEY + BACKUP_SUFFIX)).not.toBe(v1Primary);
  });
});

// Atomic-write regression tests (Task #167).
// AsyncStorage's per-key writes are atomic, but a power-loss / OS-kill
// between the temp-write and the swap could previously have left the
// slot key holding garbage. atomicWriteSlot routes every write through
// a tmp key first; these tests prove that under each failure mode the
// slot key is either old-or-new but never half-written.
describe("atomic slot writes survive interrupted writes", () => {
  // Storage that fails the Nth call to a configured method. Used to
  // simulate a crash at a specific phase without needing a real OS kill.
  class InterruptibleStorage implements SlotStorage {
    store = new Map<string, string>();
    failOn: { method: "setItem" | "multiSet" | "removeItem" | "multiRemove"; key?: string; afterCalls?: number } | null = null;
    callCounts = { setItem: 0, multiSet: 0, removeItem: 0, multiRemove: 0, getItem: 0 };

    async getItem(key: string): Promise<string | null> {
      this.callCounts.getItem++;
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    async setItem(key: string, value: string): Promise<void> {
      this.callCounts.setItem++;
      this.maybeFail("setItem", key);
      this.store.set(key, value);
    }
    async removeItem(key: string): Promise<void> {
      this.callCounts.removeItem++;
      this.maybeFail("removeItem", key);
      this.store.delete(key);
    }
    async multiSet(pairs: [string, string][]): Promise<void> {
      this.callCounts.multiSet++;
      this.maybeFail("multiSet");
      // Real AsyncStorage applies the batch atomically. Mirror that here
      // so we don't accidentally test a non-atomic shim instead of the
      // production path.
      for (const [k, v] of pairs) this.store.set(k, v);
    }
    async multiRemove(keys: string[]): Promise<void> {
      this.callCounts.multiRemove++;
      this.maybeFail("multiRemove");
      for (const k of keys) this.store.delete(k);
    }

    private maybeFail(method: string, key?: string) {
      const f = this.failOn;
      if (!f || f.method !== method) return;
      if (f.key && f.key !== key) return;
      if (f.afterCalls != null && this.callCounts[method as keyof typeof this.callCounts] <= f.afterCalls) return;
      throw new Error(`InterruptibleStorage: simulated crash on ${method}${key ? ` (${key})` : ""}`);
    }
  }

  const TMP_KEY = SLOT_KEY + TMP_SUFFIX;
  const BACKUP_KEY = SLOT_KEY + BACKUP_SUFFIX;

  it("clean write commits to the slot and cleans up the tmp key", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();
    await writeSlotSave(storage, SLOT_KEY, state);

    expect(storage.store.has(SLOT_KEY)).toBe(true);
    // Tmp must be cleaned up so it doesn't accumulate over thousands of
    // autosaves and balloon storage usage.
    expect(storage.store.has(TMP_KEY)).toBe(false);
    const { json, valid } = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(valid).toBe(true);
    expect((JSON.parse(json) as GameState).totalTicks).toBe(state.totalTicks);
  });

  it("interrupt between tmp-write and swap preserves the previous slot value", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();

    // Establish a known-good prior save.
    await writeSlotSave(storage, SLOT_KEY, state);
    const priorPrimary = storage.store.get(SLOT_KEY)!;

    // Now interrupt the next write *after* the tmp setItem succeeds but
    // *before* the swap commits. atomicWriteSlot calls setItem on the
    // tmp key first (call #1 in this run), so failing on the 2nd setItem
    // simulates a power loss between phase 1 and phase 2. The mock here
    // tracks setItem calls cumulatively, so we tell it to fail strictly
    // after the first additional setItem (the tmp write), regardless of
    // whether the multiSet path is used for the swap.
    storage.callCounts.setItem = 0;
    storage.callCounts.multiSet = 0;
    storage.failOn = { method: "multiSet" };
    // Ensure that if multiSet ever falls back, the next setItem to the
    // primary slot key also fails — i.e. the swap can't complete.
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 100 };

    let threw = false;
    try {
      // Override setItem to fail on the swap-to-primary specifically.
      const origSetItem = storage.setItem.bind(storage);
      storage.setItem = async (k: string, v: string) => {
        if (k === SLOT_KEY) throw new Error("simulated crash mid-swap");
        return origSetItem(k, v);
      };
      await writeSlotSave(storage, SLOT_KEY, advanced);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Critical invariant: the live slot key still holds the prior value.
    // No torn write, no garbage, no advancement.
    expect(storage.store.get(SLOT_KEY)).toBe(priorPrimary);
    const { json, valid } = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(valid).toBe(true);
    expect((JSON.parse(json) as GameState).totalTicks).toBe(state.totalTicks);
  });

  it("interrupt with no prior slot leaves the slot empty (not corrupted)", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();

    // Fail the swap setItem on the primary slot key. With no prior value
    // there's nothing to roll back to — the slot must simply remain
    // unset. The important thing is it never contains half-written data.
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = async (k: string, v: string) => {
      if (k === SLOT_KEY) throw new Error("simulated crash mid-swap (cold)");
      return origSetItem(k, v);
    };

    let threw = false;
    try {
      await writeSlotSave(storage, SLOT_KEY, state);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    expect(storage.store.has(SLOT_KEY)).toBe(false);
    expect(storage.store.has(BACKUP_KEY)).toBe(false);
    // The tmp blob may or may not be present depending on phase reached.
    // Either way it must be ignored on load — only SLOT_KEY is the
    // source of truth, and it is empty rather than garbage.
  });

  it("recovers and writes cleanly on the very next attempt after an interrupt", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();

    // First write succeeds.
    await writeSlotSave(storage, SLOT_KEY, state);

    // Second write is interrupted mid-swap. With a prior primary
    // present, atomicWriteSlot takes the multiSet branch, so failing
    // multiSet is what reproduces a real-world crash mid-commit.
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 50 };
    storage.failOn = { method: "multiSet" };
    // Also block the setItem fallback path, in case multiSet's catch
    // tries to recover via individual setItem calls.
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = async (k: string, v: string) => {
      if (storage.failOn?.method === "multiSet" && k === SLOT_KEY) {
        throw new Error("simulated crash mid-swap (fallback blocked)");
      }
      return origSetItem(k, v);
    };
    await expect(writeSlotSave(storage, SLOT_KEY, advanced)).rejects.toThrow();

    // Third write — the player resumes; the next save should land cleanly.
    storage.failOn = null;
    const further: GameState = { ...state, totalTicks: state.totalTicks + 200 };
    await writeSlotSave(storage, SLOT_KEY, further);

    expect(storage.store.has(TMP_KEY)).toBe(false);
    const { json, valid } = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(valid).toBe(true);
    expect((JSON.parse(json) as GameState).totalTicks).toBe(state.totalTicks + 200);
  });

  it("recovers from a failed batch commit when the per-key fallback succeeds", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();
    await writeSlotSave(storage, SLOT_KEY, state);
    const priorPrimary = storage.store.get(SLOT_KEY)!;

    // A backend can reject multiSet without rejecting individual writes.
    // The fallback must still preserve the previous generation in backup and
    // commit the new generation instead of surfacing a false save failure.
    storage.failOn = { method: "multiSet" };
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 75 };
    await writeSlotSave(storage, SLOT_KEY, advanced);

    expect(storage.store.get(BACKUP_KEY)).toBe(priorPrimary);
    const primary = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(primary.valid).toBe(true);
    expect((JSON.parse(primary.json) as GameState).totalTicks).toBe(state.totalTicks + 75);
    expect(storage.store.has(TMP_KEY)).toBe(false);
  });

  it("preserves the prior save when the temporary write fails with an I/O error", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();
    await writeSlotSave(storage, SLOT_KEY, state);
    const priorPrimary = storage.store.get(SLOT_KEY)!;

    const ioErr = new Error("native storage bridge unavailable");
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = async (key: string, value: string) => {
      if (key === TMP_KEY) throw ioErr;
      return originalSetItem(key, value);
    };

    await expect(
      writeSlotSave(storage, SLOT_KEY, { ...state, totalTicks: state.totalTicks + 1 }),
    ).rejects.toMatchObject({ name: "SaveWriteError", kind: "io", cause: ioErr });

    expect(storage.store.get(SLOT_KEY)).toBe(priorPrimary);
    expect(storage.store.has(BACKUP_KEY)).toBe(false);
    expect(storage.store.has(TMP_KEY)).toBe(false);
  });

  it("recovers from a failed tmp cleanup on the next save", async () => {
    const storage = new InterruptibleStorage();
    const state = createInitialState();
    const originalMultiRemove = storage.multiRemove.bind(storage);
    storage.multiRemove = async (keys: string[]) => {
      if (storage.callCounts.multiRemove === 0 && keys.includes(TMP_KEY)) {
        throw new Error("simulated crash during cleanup");
      }
      return originalMultiRemove(keys);
    };

    // Phase 3 is best-effort: a cleanup failure should not turn a successful
    // save into a failed save, and the next save must remove the leftover.
    await writeSlotSave(storage, SLOT_KEY, state);
    expect(storage.store.has(SLOT_KEY)).toBe(true);
    expect(storage.store.has(TMP_KEY)).toBe(true);

    storage.multiRemove = originalMultiRemove;
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 2 };
    await writeSlotSave(storage, SLOT_KEY, advanced);

    expect(storage.store.has(TMP_KEY)).toBe(false);
    const primary = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(primary.valid).toBe(true);
    expect((JSON.parse(primary.json) as GameState).totalTicks).toBe(state.totalTicks + 2);
  });

  it("throws a typed quota error when the tmp write is rejected, leaving the prior save intact", async () => {
    // Quota / disk-full at phase 1 must NOT touch the live slot or the
    // backup. Pre-launch audit (Task #170): the previous code path let
    // a quota failure bubble as a generic Error and the GameContext
    // catch-all swallowed it into console.error. Now it surfaces as a
    // typed SaveWriteError({kind: "quota"}) so the SaveIndicator can
    // flip to a visible "STORAGE FULL" badge.
    const storage = new InterruptibleStorage();
    const state = createInitialState();

    // Establish a known-good prior save first.
    await writeSlotSave(storage, SLOT_KEY, state);
    const priorPrimary = storage.store.get(SLOT_KEY)!;

    // Inject a quota failure on the next tmp write. We use a
    // DOMException-style name because that's the most common shape on
    // web localStorage (the AsyncStorage shim mirrors it). The
    // detection in saveLoad.ts also handles ENOSPC and message-based
    // matches.
    const quotaErr = Object.assign(new Error("storage quota exceeded"), {
      name: "QuotaExceededError",
    });
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = async (k: string, v: string) => {
      if (k.endsWith(TMP_SUFFIX)) throw quotaErr;
      return origSetItem(k, v);
    };

    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 100 };
    let caught: unknown = null;
    try {
      await writeSlotSave(storage, SLOT_KEY, advanced);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(SaveWriteError);
    expect((caught as SaveWriteError).kind).toBe("quota");
    // Live slot key is untouched — the previous good save survives.
    expect(storage.store.get(SLOT_KEY)).toBe(priorPrimary);
    // Backup key was never even visited because phase 1 failed.
    expect(storage.store.has(BACKUP_KEY)).toBe(false);
  });

  it("classifies ENOSPC as a quota failure", async () => {
    // Native AsyncStorage on iOS/Android can surface disk-full as an
    // errno string rather than a DOMException. Ensure the classifier
    // catches that shape too.
    const storage = new InterruptibleStorage();
    const state = createInitialState();
    const enospc = Object.assign(new Error("write failed"), { code: "ENOSPC" });
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = async (k: string, v: string) => {
      if (k.endsWith(TMP_SUFFIX)) throw enospc;
      return origSetItem(k, v);
    };

    let caught: unknown = null;
    try {
      await writeSlotSave(storage, SLOT_KEY, state);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SaveWriteError);
    expect((caught as SaveWriteError).kind).toBe("quota");
  });

  it("classifies an unrelated IO failure as 'io', not 'quota'", async () => {
    // Native bridge / permission errors should not be mis-reported as
    // a storage-full condition — the player UI message differs.
    const storage = new InterruptibleStorage();
    const state = createInitialState();
    const ioErr = new Error("native module bridge offline");
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = async (k: string, v: string) => {
      if (k.endsWith(TMP_SUFFIX)) throw ioErr;
      return origSetItem(k, v);
    };

    let caught: unknown = null;
    try {
      await writeSlotSave(storage, SLOT_KEY, state);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SaveWriteError);
    expect((caught as SaveWriteError).kind).toBe("io");
  });

  it("falls back to per-key setItem when the backend has no multiSet", async () => {
    // Web AsyncStorage shim has setItem only — confirm the fallback path
    // still rotates backup and writes the new primary atomically per-key.
    const storage = new InterruptibleStorage();
    // Strip the optional methods to exercise the fallback branch.
    // Typed deletes (no `any`) so future renames in SlotStorage still
    // type-check against this scaffolding.
    delete (storage as { multiSet?: SlotStorage["multiSet"] }).multiSet;
    delete (storage as { multiRemove?: SlotStorage["multiRemove"] }).multiRemove;

    const state = createInitialState();
    await writeSlotSave(storage, SLOT_KEY, state);
    const advanced: GameState = { ...state, totalTicks: state.totalTicks + 7 };
    await writeSlotSave(storage, SLOT_KEY, advanced);

    // Backup must hold the prior generation; primary must hold the new one.
    const backup = unwrapSave(storage.store.get(BACKUP_KEY)!);
    expect(backup.valid).toBe(true);
    expect((JSON.parse(backup.json) as GameState).totalTicks).toBe(state.totalTicks);

    const primary = unwrapSave(storage.store.get(SLOT_KEY)!);
    expect(primary.valid).toBe(true);
    expect((JSON.parse(primary.json) as GameState).totalTicks).toBe(state.totalTicks + 7);

    // Tmp key cleaned up via removeItem fallback.
    expect(storage.store.has(TMP_KEY)).toBe(false);
  });
});

describe("sweepStaleTmpKeys", () => {
  // A crash between phase-2 commit and phase-3 cleanup of atomicWriteSlot
  // (or the panic-save path) can strand `<slot>.tmp` blobs in storage.
  // Each one is harmless on its own but accumulates if the player rotates
  // through slots or the app keeps crashing. Init runs this sweep before
  // handing out the SlotLock so leftovers never balloon AsyncStorage usage.

  class EnumerableStorage implements SlotStorage {
    store = new Map<string, string>();
    async getItem(key: string): Promise<string | null> {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    async setItem(key: string, value: string): Promise<void> {
      this.store.set(key, value);
    }
    async removeItem(key: string): Promise<void> {
      this.store.delete(key);
    }
    async getAllKeys(): Promise<readonly string[]> {
      return [...this.store.keys()];
    }
  }

  const PREFIX = "@megacity_slot_";

  it("removes orphaned tmp keys matching the prefix and leaves unrelated keys alone", async () => {
    const storage = new EnumerableStorage();
    // Stranded tmp blobs from crashes mid-save and mid-panic-save.
    storage.store.set("@megacity_slot_1.tmp", "stale-1");
    storage.store.set("@megacity_slot_3.tmp", "stale-3");
    storage.store.set("@megacity_slot_recovery.tmp", "stale-recovery");
    // Live slot keys and an unrelated key that must survive the sweep.
    storage.store.set("@megacity_slot_1", "live-primary");
    storage.store.set("@megacity_slot_1_backup", "live-backup");
    storage.store.set("@megacity_settings", "untouched");
    storage.store.set("@some_other_thing.tmp", "not-ours");

    const removed = await sweepStaleTmpKeys(storage, [PREFIX]);

    expect(removed.sort()).toEqual(
      ["@megacity_slot_1.tmp", "@megacity_slot_3.tmp", "@megacity_slot_recovery.tmp"].sort(),
    );
    expect(storage.store.has("@megacity_slot_1.tmp")).toBe(false);
    expect(storage.store.has("@megacity_slot_3.tmp")).toBe(false);
    expect(storage.store.has("@megacity_slot_recovery.tmp")).toBe(false);
    // Non-tmp keys under the prefix and unrelated keys must be preserved.
    expect(storage.store.get("@megacity_slot_1")).toBe("live-primary");
    expect(storage.store.get("@megacity_slot_1_backup")).toBe("live-backup");
    expect(storage.store.get("@megacity_settings")).toBe("untouched");
    expect(storage.store.get("@some_other_thing.tmp")).toBe("not-ours");
  });

  it("uses multiRemove when available", async () => {
    const calls: string[][] = [];
    const storage: SlotStorage = {
      async getItem() {
        return null;
      },
      async setItem() {},
      async getAllKeys() {
        return ["@megacity_slot_2.tmp", "@megacity_slot_2", "@megacity_slot_recovery.tmp"];
      },
      async multiRemove(keys) {
        calls.push([...keys]);
      },
    };

    const removed = await sweepStaleTmpKeys(storage, [PREFIX]);
    expect(removed.sort()).toEqual(
      ["@megacity_slot_2.tmp", "@megacity_slot_recovery.tmp"].sort(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].sort()).toEqual(
      ["@megacity_slot_2.tmp", "@megacity_slot_recovery.tmp"].sort(),
    );
  });

  it("is a safe no-op when getAllKeys is unavailable", async () => {
    const storage: SlotStorage = {
      async getItem() {
        return null;
      },
      async setItem() {},
    };
    const removed = await sweepStaleTmpKeys(storage, [PREFIX]);
    expect(removed).toEqual([]);
  });
});
