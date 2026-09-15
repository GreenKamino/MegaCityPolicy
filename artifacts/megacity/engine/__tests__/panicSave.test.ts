import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Task #170: the panic-save path must verify its own write by reading
// the recovery key back and confirming the checksum matches before
// declaring victory. If the read-back is corrupted (truncation under
// quota, encoding bug, native bridge glitch), the recovery key is
// dropped so the post-crash UI never offers the player a snapshot
// that would crash on load.

// vi.mock is hoisted to the top of the module, so the mock factory
// can't close over module-level test state. Use vi.hoisted to declare
// the shared mock storage in a way that survives the hoist and is
// still reachable by the test cases below.
const { mockStorage } = vi.hoisted(() => {
  class MockAsyncStorage {
    store = new Map<string, string>();
    postSetItem: ((key: string, value: string, store: Map<string, string>) => void) | null = null;
    async getItem(key: string): Promise<string | null> {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    async setItem(key: string, value: string): Promise<void> {
      this.store.set(key, value);
      this.postSetItem?.(key, value, this.store);
    }
    async removeItem(key: string): Promise<void> {
      this.store.delete(key);
    }
  }
  return { mockStorage: new MockAsyncStorage() };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mockStorage,
}));

// Pull these AFTER the mock so panicSave.ts binds to the mock backend.
import { RECOVERY_SAVE_KEY, registerPanicSaveAccessor, triggerPanicSave } from "@/engine/panicSave";
import { TMP_SUFFIX } from "@/engine/saveLoad";
import { createInitialState } from "@/engine/initialState";

const RECOVERY_TMP_KEY = RECOVERY_SAVE_KEY + TMP_SUFFIX;

// triggerPanicSave fires its actual write inside an inner async IIFE.
// Wait one microtask plus a setTimeout(0) bounce so the awaited setItem
// + readback sequence has a chance to complete before assertions run.
async function flushPanicWrite(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("triggerPanicSave checksum read-back verification", () => {
  beforeEach(() => {
    mockStorage.store.clear();
    mockStorage.postSetItem = null;
    // Throttle is module-level state; advance fake time per test to
    // bypass the 5s self-throttle.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    vi.useRealTimers();
  });

  afterEach(() => {
    registerPanicSaveAccessor(null);
  });

  it("commits the recovery snapshot when the read-back checksum is valid", async () => {
    const state = createInitialState();
    registerPanicSaveAccessor(() => state);

    triggerPanicSave();
    await flushPanicWrite();

    const raw = mockStorage.store.get(RECOVERY_SAVE_KEY);
    expect(raw).toBeTruthy();
    // Tmp key cleaned up.
    expect(mockStorage.store.has(RECOVERY_TMP_KEY)).toBe(false);
  });

  it("clears the recovery key when the read-back checksum fails", async () => {
    const state = createInitialState();
    registerPanicSaveAccessor(() => state);

    // Simulate a backend that silently corrupts the bytes after write
    // (e.g. truncation under quota). The read-back will fail checksum
    // verification and panicSave should drop the recovery key rather
    // than leave a poison snapshot for the post-crash UI to load.
    mockStorage.postSetItem = (key, _value, store) => {
      if (key === RECOVERY_SAVE_KEY) {
        store.set(key, "💥 corrupted bytes 💥");
      }
    };

    triggerPanicSave();
    await flushPanicWrite();

    expect(mockStorage.store.has(RECOVERY_SAVE_KEY)).toBe(false);
  });
});
