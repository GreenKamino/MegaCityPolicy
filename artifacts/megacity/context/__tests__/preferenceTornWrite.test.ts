import { beforeEach, describe, expect, it } from "vitest";

import { atomicWriteSlot, TMP_SUFFIX } from "@/engine/saveLoad";

// In-memory AsyncStorage-shaped mock with crash injection. Mirrors the
// pattern in profileSlots.test.ts (Task #173) — the contexts under test
// (Settings/Theme/Tutorial/GameContext.global-achievements) all funnel
// their single-key writes through atomicWriteSlot, so exercising the
// helper directly with the same mock pattern proves the contexts
// inherit the same torn-write protection.
type FailHook = ((key: string) => boolean) | null;
const memoryStore = new Map<string, string>();
let failOnSetItem: FailHook = null;
let failOnMultiSet: ((pairs: [string, string][]) => boolean) | null = null;

const storage = {
  getItem: async (k: string) =>
    memoryStore.has(k) ? memoryStore.get(k)! : null,
  setItem: async (k: string, v: string) => {
    if (failOnSetItem && failOnSetItem(k)) {
      throw new Error(`simulated crash on setItem(${k})`);
    }
    memoryStore.set(k, v);
  },
  removeItem: async (k: string) => {
    memoryStore.delete(k);
  },
  multiSet: async (pairs: [string, string][]) => {
    if (failOnMultiSet && failOnMultiSet(pairs)) {
      throw new Error("simulated crash on multiSet");
    }
    for (const [k, v] of pairs) memoryStore.set(k, v);
  },
  multiRemove: async (keys: string[]) => {
    for (const k of keys) memoryStore.delete(k);
  },
  getAllKeys: async () => Array.from(memoryStore.keys()),
};

describe("single-key preference writes survive a torn write (Task #191)", () => {
  beforeEach(() => {
    memoryStore.clear();
    failOnSetItem = null;
    failOnMultiSet = null;
  });

  // The four call sites refactored in Task #191 all pass through
  // atomicWriteSlot with their respective AsyncStorage keys. Use the
  // real settings key here as a representative — the helper is
  // key-agnostic, so proving torn-write survival on one key proves it
  // for all of them.
  const SETTINGS_KEY = "@megacity_settings";

  it("@megacity_settings: a crash mid-commit leaves the prior settings blob intact", async () => {
    // Establish a known-good prior settings blob.
    const prior = JSON.stringify({ fontScale: "normal", soundMuted: false });
    await atomicWriteSlot(storage, SETTINGS_KEY, prior);
    expect(memoryStore.get(SETTINGS_KEY)).toBe(prior);

    // Simulate a power loss between phase 1 (tmp write) and phase 2
    // (swap commit). atomicWriteSlot uses multiSet when a prior
    // primary exists, so we fail multiSet AND any direct setItem to
    // the live key — the swap can't complete via either code path.
    failOnMultiSet = () => true;
    failOnSetItem = (k) => k === SETTINGS_KEY;

    const next = JSON.stringify({ fontScale: "xlarge", soundMuted: true });
    let threw = false;
    try {
      await atomicWriteSlot(storage, SETTINGS_KEY, next);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Critical invariant: the live settings key still holds the prior
    // good blob — no garbage, no half-written JSON. Without the
    // tmp-key swap, a plain setItem failure would have either left
    // the key holding the new (failed) value or — worse — emptied it.
    expect(memoryStore.get(SETTINGS_KEY)).toBe(prior);
    expect(JSON.parse(memoryStore.get(SETTINGS_KEY)!)).toEqual({
      fontScale: "normal",
      soundMuted: false,
    });
  });

  it("@megacity_settings: a crash during the tmp-write phase never touches the live key", async () => {
    // Cold case: there is NO prior primary. atomicWriteSlot's tmp
    // pre-stage writes to <key>.tmp first; if even that fails, the
    // live key must remain absent (not be left with a partial value).
    const tmpKey = SETTINGS_KEY + TMP_SUFFIX;
    failOnSetItem = (k) => k === tmpKey;

    let threw = false;
    try {
      await atomicWriteSlot(storage, SETTINGS_KEY, JSON.stringify({ x: 1 }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Live key was never touched, and the failed tmp blob was cleaned
    // up so it can't bloat storage on a retry.
    expect(memoryStore.has(SETTINGS_KEY)).toBe(false);
    expect(memoryStore.has(tmpKey)).toBe(false);
  });
});
