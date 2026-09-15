import { describe, expect, it } from "vitest";

import type {
  AtlasCapstoneGranted,
  AtlasRewardGranted,
} from "@/engine/atlasCategoryRewards";
import {
  atlasUnlockReducer,
  summarizeAtlasUnlock,
  type AtlasUnlockEvent,
} from "@/context/AtlasUnlockContext";

const grantedZones: AtlasRewardGranted = { id: "zone", label: "ZONES", xp: 75 };
const grantedRanges: AtlasRewardGranted = { id: "mountain", label: "RANGES", xp: 75 };
const capstone: AtlasCapstoneGranted = {
  xp: 1000,
  title: "Master Cartographer",
  previousTitle: "City Commander",
};

function makeEvent(
  id: string,
  granted: AtlasRewardGranted[],
  cap?: AtlasCapstoneGranted
): AtlasUnlockEvent {
  return { id, granted, capstone: cap };
}

describe("atlasUnlockReducer", () => {
  it("enqueues a category-only unlock", () => {
    const next = atlasUnlockReducer([], {
      type: "push",
      event: makeEvent("a", [grantedZones]),
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("a");
    expect(next[0].granted[0].label).toBe("ZONES");
    expect(next[0].capstone).toBeUndefined();
  });

  it("enqueues a capstone-only unlock", () => {
    const next = atlasUnlockReducer([], {
      type: "push",
      event: makeEvent("cap", [], capstone),
    });
    expect(next).toHaveLength(1);
    expect(next[0].capstone?.title).toBe("Master Cartographer");
  });

  it("ignores empty unlocks (no granted, no capstone)", () => {
    const next = atlasUnlockReducer([], {
      type: "push",
      event: makeEvent("noop", []),
    });
    expect(next).toEqual([]);
  });

  it("preserves FIFO order across multiple pushes", () => {
    let state: AtlasUnlockEvent[] = [];
    state = atlasUnlockReducer(state, { type: "push", event: makeEvent("first", [grantedZones]) });
    state = atlasUnlockReducer(state, { type: "push", event: makeEvent("second", [grantedRanges]) });
    expect(state.map((e) => e.id)).toEqual(["first", "second"]);
  });

  it("dismiss pops the head of the queue", () => {
    let state: AtlasUnlockEvent[] = [
      makeEvent("first", [grantedZones]),
      makeEvent("second", [grantedRanges]),
    ];
    state = atlasUnlockReducer(state, { type: "dismiss" });
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe("second");
  });

  it("dismiss on an empty queue is a no-op", () => {
    const next = atlasUnlockReducer([], { type: "dismiss" });
    expect(next).toEqual([]);
  });
});

describe("summarizeAtlasUnlock", () => {
  it("renders survey-unlocked header and totals XP across multiple categories", () => {
    const summary = summarizeAtlasUnlock(
      makeEvent("evt", [grantedZones, grantedRanges])
    );
    expect(summary.headerLabel).toBe("ATLAS SURVEY UNLOCKED");
    expect(summary.totalXp).toBe(150);
    expect(summary.categoryLabels).toEqual(["ZONES", "RANGES"]);
    expect(summary.capstoneTitle).toBeUndefined();
  });

  it("switches to capstone header and adds the capstone XP", () => {
    const summary = summarizeAtlasUnlock(
      makeEvent("evt", [grantedZones], capstone)
    );
    expect(summary.headerLabel).toBe("WASTELAND ATLAS COMPLETE");
    expect(summary.totalXp).toBe(75 + 1000);
    expect(summary.categoryLabels).toEqual(["ZONES"]);
    expect(summary.capstoneTitle).toBe("Master Cartographer");
  });

  it("handles a capstone-only event with no granted categories", () => {
    const summary = summarizeAtlasUnlock(makeEvent("evt", [], capstone));
    expect(summary.headerLabel).toBe("WASTELAND ATLAS COMPLETE");
    expect(summary.totalXp).toBe(1000);
    expect(summary.categoryLabels).toEqual([]);
    expect(summary.capstoneTitle).toBe("Master Cartographer");
  });
});
