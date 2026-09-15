import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Track AppState listeners installed by the hook so the test can drive
// background/inactive transitions deterministically without a real native
// module. The mock also exposes how many listeners are currently registered
// so we can assert the gating behavior of `enableBackgroundSave:false`.
type Listener = (next: string) => void;
const appStateListeners: Listener[] = [];

vi.mock("react-native", () => {
  return {
    Platform: { OS: "ios" },
    BackHandler: {
      addEventListener: () => ({ remove: () => {} }),
    },
    Alert: { alert: () => {} },
    AppState: {
      currentState: "active",
      addEventListener: (event: string, fn: Listener) => {
        if (event === "change") {
          appStateListeners.push(fn);
        }
        return {
          remove: () => {
            const i = appStateListeners.indexOf(fn);
            if (i >= 0) appStateListeners.splice(i, 1);
          },
        };
      },
    },
  };
});

import TestRenderer, { act } from "react-test-renderer";
import { useNativeExitConfirm } from "@/hooks/useNativeExitConfirm";

function HookHost(props: Parameters<typeof useNativeExitConfirm>[0]) {
  useNativeExitConfirm(props);
  return null;
}

beforeEach(() => {
  appStateListeners.length = 0;
});

afterEach(() => {
  appStateListeners.length = 0;
});

async function fireBackground() {
  // Snapshot the listeners array before invoking — calling listeners may
  // trigger React effects that mutate the array (re-subscribing).
  const snapshot = [...appStateListeners];
  await act(async () => {
    for (const l of snapshot) l("background");
    // Let the floating microtasks (runSave's async chain) resolve.
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useNativeExitConfirm — background-save gating", () => {
  it("does NOT register the AppState listener when enableBackgroundSave:false", () => {
    const onBackgroundSave = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, {
          enabled: false,
          enableBackgroundSave: false,
          onSaveAndExit: () => {},
          onExit: () => {},
          onBackgroundSave,
        }),
      );
    });

    // Hard guarantee: only one listener (or zero) per backgrounding event.
    // When background-save is opted out, no listener should be installed,
    // so a background transition cannot fire the save callback even if
    // some other code path dispatches the event.
    expect(appStateListeners.length).toBe(0);

    act(() => {
      // Even if we manually invoke nothing happens — there's nothing to call.
      for (const l of appStateListeners) l("background");
    });
    expect(onBackgroundSave).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });

  it("fires onBackgroundSave exactly once per backgrounding event when enabled (default)", async () => {
    const onBackgroundSave = vi.fn().mockResolvedValue(undefined);
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, {
          enabled: false,
          // enableBackgroundSave omitted → defaults to true
          onSaveAndExit: () => {},
          onExit: () => {},
          onBackgroundSave,
        }),
      );
    });

    // Exactly one listener installed by the hook — re-renders must not stack
    // duplicate AppState subscriptions, which would multiply background-save
    // calls per backgrounding event.
    expect(appStateListeners.length).toBe(1);

    await fireBackground();
    expect(onBackgroundSave).toHaveBeenCalledTimes(1);

    // A second listener-snapshot dispatch (e.g. the OS sending another
    // active→background while still in background) should not fire again,
    // because the hook only saves on the active→background edge.
    await fireBackground();
    expect(onBackgroundSave).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
    expect(appStateListeners.length).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────
// saveInFlightRef lock — concurrent background + autosave on the same slot
// ─────────────────────────────────────────────────────────────────────────
//
// `GameContext.saveToSlot` keys an in-flight Promise per slot via the
// `createSlotLock()` helper (see `engine/saveLock.ts`). These tests
// exercise that exact production helper — the same instance type the
// GameProvider stores in `saveInFlightRef.current` — so any regression in
// the real lock behavior fails here.
import { createSlotLock } from "@/engine/saveLock";

describe("saveInFlightRef lock — concurrent background + autosave", () => {
  it("collapses concurrent saves to the same slot into a single underlying write", async () => {
    let resolveWrite: (() => void) | null = null;
    const writePending = new Promise<void>((r) => { resolveWrite = r; });
    const write = vi.fn().mockImplementation((_slot: number) => writePending);
    const lock = createSlotLock();

    // Background-save and autosave both target slot 1 simultaneously.
    const a = lock.run(1, () => write(1));
    const b = lock.run(1, () => write(1));

    // Lock map should hold exactly one entry for slot 1.
    expect(lock.inFlight.size).toBe(1);
    expect(lock.inFlight.has(1)).toBe(true);

    // Resolve the underlying write and let both callers settle.
    resolveWrite!();
    await Promise.all([a, b]);

    // Critical invariant: only one write actually fired despite two callers.
    expect(write).toHaveBeenCalledTimes(1);

    // Lock cleared after settle so future saves run fresh.
    expect(lock.inFlight.has(1)).toBe(false);
  });

  it("does not invoke the second caller's task while a save is in flight", async () => {
    let resolveWrite: (() => void) | null = null;
    const writePending = new Promise<void>((r) => { resolveWrite = r; });
    const firstTask = vi.fn().mockReturnValue(writePending);
    const secondTask = vi.fn().mockResolvedValue(undefined);
    const lock = createSlotLock();

    const a = lock.run(1, firstTask);
    const b = lock.run(1, secondTask);

    // The second caller's task must NOT run while the first is in flight —
    // both callers share the first task's outcome. This is what guarantees
    // background-save and autosave don't double-write the same slot.
    expect(firstTask).toHaveBeenCalledTimes(1);
    expect(secondTask).not.toHaveBeenCalled();

    resolveWrite!();
    await Promise.all([a, b]);
    // Even after settle, the second task is still skipped — it was deduped.
    expect(secondTask).not.toHaveBeenCalled();
  });

  it("allows concurrent saves to different slots to run independently", async () => {
    const resolvers: Record<number, () => void> = {};
    const write = vi.fn().mockImplementation((slot: number) => {
      return new Promise<void>((r) => { resolvers[slot] = r; });
    });
    const lock = createSlotLock();

    const p1 = lock.run(1, () => write(1));
    const p2 = lock.run(2, () => write(2));
    expect(lock.inFlight.size).toBe(2);
    expect(write).toHaveBeenCalledTimes(2);

    resolvers[1]!();
    resolvers[2]!();
    await Promise.all([p1, p2]);
    expect(lock.inFlight.size).toBe(0);
  });

  it("subsequent save after settle runs a fresh write (no stale promise reuse)", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const lock = createSlotLock();

    await lock.run(1, () => write(1));
    expect(write).toHaveBeenCalledTimes(1);
    expect(lock.inFlight.has(1)).toBe(false);

    await lock.run(1, () => write(1));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("clears the lock entry when the underlying write throws", async () => {
    const write = vi
      .fn<(slot: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const lock = createSlotLock();

    await expect(lock.run(1, () => write(1))).rejects.toThrow("boom");
    expect(lock.inFlight.has(1)).toBe(false);

    // Lock cleanly released → next save proceeds.
    await lock.run(1, () => write(1));
    expect(write).toHaveBeenCalledTimes(2);
  });
});
