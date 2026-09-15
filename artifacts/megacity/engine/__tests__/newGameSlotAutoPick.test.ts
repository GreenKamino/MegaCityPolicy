import { describe, expect, it } from "vitest";

import { MAX_SLOTS_PER_PROFILE, firstEmptyNewGameSlot } from "@/engine/profiles";
import type { SaveSlotMeta } from "@/engine/types";

// Quick "NEW GAME" on the main menu auto-picks the first provably empty
// save slot (Task #530). The helper must be strictly conservative: it may
// only pick a slot whose meta EXPLICITLY says isEmpty === true — a missing
// meta entry (metas not yet hydrated) must never be treated as empty,
// because auto-starting there could overwrite a real save.

function makeMeta(slotId: number, isEmpty: boolean): SaveSlotMeta {
  return {
    slotId,
    isEmpty,
    playerName: isEmpty ? "" : "Cmdr Test",
    cityName: isEmpty ? "" : "MEGACITY JUAN",
    label: "",
    totalTicks: isEmpty ? 0 : 500,
    playerLevel: isEmpty ? 0 : 3,
    population: isEmpty ? 0 : 120000,
    lastSaved: isEmpty ? 0 : Date.now(),
    honorMode: false,
  };
}

function allSlots(occupied: number[]): SaveSlotMeta[] {
  const metas: SaveSlotMeta[] = [];
  for (let i = 1; i <= MAX_SLOTS_PER_PROFILE; i++) {
    metas.push(makeMeta(i, !occupied.includes(i)));
  }
  return metas;
}

describe("firstEmptyNewGameSlot", () => {
  it("returns null for an empty meta list (not yet hydrated)", () => {
    expect(firstEmptyNewGameSlot([])).toBeNull();
  });

  it("picks slot 1 when everything is empty", () => {
    expect(firstEmptyNewGameSlot(allSlots([]))).toBe(1);
  });

  it("picks the lowest empty slot when earlier slots are occupied", () => {
    expect(firstEmptyNewGameSlot(allSlots([1]))).toBe(2);
    expect(firstEmptyNewGameSlot(allSlots([1, 2, 3]))).toBe(4);
  });

  it("skips an empty gap only in slot order, not meta array order", () => {
    // Metas intentionally shuffled: slot order must win.
    const metas = [makeMeta(5, true), makeMeta(2, true), makeMeta(1, false)];
    expect(firstEmptyNewGameSlot(metas)).toBe(2);
  });

  it("returns null when every slot is occupied", () => {
    expect(firstEmptyNewGameSlot(allSlots([1, 2, 3, 4, 5, 6]))).toBeNull();
  });

  it("never treats a MISSING meta entry as empty", () => {
    // Only slots 1-2 present (both occupied); 3-6 missing entirely.
    const metas = [makeMeta(1, false), makeMeta(2, false)];
    expect(firstEmptyNewGameSlot(metas)).toBeNull();
  });

  it("respects a custom totalSlots bound", () => {
    // Slot 3 is empty but outside a 2-slot bound.
    const metas = [makeMeta(1, false), makeMeta(2, false), makeMeta(3, true)];
    expect(firstEmptyNewGameSlot(metas, 2)).toBeNull();
    expect(firstEmptyNewGameSlot(metas, 3)).toBe(3);
  });
});
