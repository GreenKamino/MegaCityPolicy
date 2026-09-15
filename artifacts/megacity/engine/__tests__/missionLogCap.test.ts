import { describe, it, expect } from "vitest";
import { capMissionLog, ARRAY_CAPS } from "@/engine/sanitizer";

type Mission = { id: string; resolved: boolean };

function mission(id: string, resolved: boolean): Mission {
  return { id, resolved };
}

describe("capMissionLog", () => {
  const CAP = ARRAY_CAPS.activeMissions;

  it("returns the array unchanged when at or under the cap", () => {
    const arr = Array.from({ length: CAP }, (_, i) => mission(`m${i}`, true));
    expect(capMissionLog(arr, CAP)).toBe(arr);
  });

  it("returns [] for non-array input", () => {
    expect(capMissionLog(undefined, CAP)).toEqual([]);
    expect(capMissionLog(null as unknown as Mission[], CAP)).toEqual([]);
  });

  it("never drops a freshly launched (unresolved) mission appended at the end", () => {
    // Reproduces the reported bug: the log is full of accumulated resolved
    // missions, then the player launches a new one (appended at the end).
    // A keep-first slice would delete it on the next tick.
    const resolved = Array.from({ length: CAP }, (_, i) => mission(`r${i}`, true));
    const fresh = mission("trade_negotiation", false);
    const arr = [...resolved, fresh];

    const out = capMissionLog(arr, CAP);

    expect(out.length).toBe(CAP);
    expect(out).toContain(fresh);
    // The oldest resolved entry is the one dropped to make room.
    expect(out).not.toContain(resolved[0]);
  });

  it("keeps every unresolved mission even when they exceed the cap budget", () => {
    // Active missions are gameplay-critical and must survive regardless of how
    // many there are relative to the cap.
    const live = Array.from({ length: CAP + 5 }, (_, i) => mission(`live${i}`, false));
    const out = capMissionLog(live, CAP);
    expect(out).toEqual(live);
  });

  it("preserves creation order of the surviving entries", () => {
    const arr = [
      mission("r0", true),
      mission("r1", true),
      mission("live", false),
      mission("r2", true),
    ];
    const out = capMissionLog(arr, 3);
    // Drops the single oldest resolved (r0); keeps r1, live, r2 in order.
    expect(out.map((m) => m.id)).toEqual(["r1", "live", "r2"]);
  });

  it("fills the remaining budget with the most recent resolved entries", () => {
    const resolved = Array.from({ length: 10 }, (_, i) => mission(`r${i}`, true));
    const live = mission("live", false);
    const arr = [...resolved, live];
    const out = capMissionLog(arr, 5);
    // 1 live is kept, budget for resolved is 4 -> the 4 most recent resolved.
    expect(out.map((m) => m.id)).toEqual(["r6", "r7", "r8", "r9", "live"]);
  });
});
