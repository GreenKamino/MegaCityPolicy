import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// In-memory AsyncStorage mock shared by SettingsContext (and the real
// atomicWriteSlot it routes persistence through). Mirrors the setup in
// settingsGroupsCoverage.test.ts so a remounted provider genuinely re-reads
// what the previous mount persisted.
const memoryStore = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) =>
      memoryStore.has(k) ? memoryStore.get(k)! : null,
    setItem: async (k: string, v: string) => {
      memoryStore.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStore.delete(k);
    },
    multiSet: async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) memoryStore.set(k, v);
    },
    multiRemove: async (keys: string[]) => {
      for (const k of keys) memoryStore.delete(k);
    },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  },
}));

// SettingsContext fires audio/haptics side-effect setters from useEffect;
// those pull in expo-audio / expo-haptics which don't load under node.
vi.mock("@/engine/audio", () => ({
  setMuted: () => {},
  setVolume: () => {},
  setAmbienceEnabled: () => {},
}));
vi.mock("@/engine/haptics", () => ({
  setHapticsEnabled: () => {},
  setHapticsReducedMotion: () => {},
}));

import {
  SettingsProvider,
  useSettings,
  normalizeUiScale,
  UI_SCALE_OPTIONS,
} from "@/context/SettingsContext";

let ctx: any;

function Capture() {
  ctx = useSettings();
  return null;
}

async function mount() {
  await act(async () => {
    TestRenderer.create(
      React.createElement(SettingsProvider, null, React.createElement(Capture)),
    );
  });
  // Flush the provider's async getItem(STORAGE_KEY) load.
  await act(async () => {
    await Promise.resolve();
  });
}

// Let fire-and-forget atomicWriteSlot persistence settle.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("uiScale setting (Task #532)", () => {
  beforeEach(() => {
    memoryStore.clear();
    ctx = undefined;
  });

  it("defaults to 100% on a fresh install", async () => {
    await mount();
    expect(ctx.uiScale).toBe(1);
  });

  it("persists across a full provider remount (app relaunch)", async () => {
    await mount();
    act(() => ctx.setSetting("uiScale", 1.25));
    await flush();
    expect(ctx.uiScale).toBe(1.25);

    // Fresh provider = fresh app launch reading the same storage.
    ctx = undefined;
    await mount();
    expect(ctx.uiScale).toBe(1.25);
  });

  it("persists the largest step (150%) too", async () => {
    await mount();
    act(() => ctx.setSetting("uiScale", 1.5));
    await flush();

    ctx = undefined;
    await mount();
    expect(ctx.uiScale).toBe(1.5);
  });

  it("normalizeUiScale snaps arbitrary persisted numbers to a valid option", () => {
    // Exact options pass through.
    for (const option of UI_SCALE_OPTIONS) {
      expect(normalizeUiScale(option)).toBe(option);
    }
    // Nearby values snap to the nearest step (old builds / edited backups).
    expect(normalizeUiScale(1.02)).toBe(1);
    expect(normalizeUiScale(1.3)).toBe(1.25);
    expect(normalizeUiScale(1.45)).toBe(1.5);
    expect(normalizeUiScale(3)).toBe(1.5);
    expect(normalizeUiScale(0.5)).toBe(1);
    // Garbage falls back to 100%.
    expect(normalizeUiScale(Number.NaN)).toBe(1);
    expect(normalizeUiScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalizeUiScale("big" as unknown as number)).toBe(1);
    expect(normalizeUiScale(undefined)).toBe(1);
    expect(normalizeUiScale(null)).toBe(1);
  });

  it("a hand-edited garbage value in storage still yields a usable scale", async () => {
    await mount();
    // Simulate an out-of-range number sneaking into persisted settings.
    act(() => ctx.setSetting("uiScale", 1.37 as any));
    await flush();

    ctx = undefined;
    await mount();
    // The raw value round-trips, and the applier/control normalize on read
    // (1.37 snaps to its nearest step, 1.25).
    expect(normalizeUiScale(ctx.uiScale)).toBe(1.25);
  });
});
