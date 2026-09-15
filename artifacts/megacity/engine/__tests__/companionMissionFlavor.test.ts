import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveMission, COMPANION_MISSION_DEFS } from "../companionMissions";

describe("companion mission class flavor", () => {
  const def = COMPANION_MISSION_DEFS[0];
  if (!def) throw new Error("expected at least one companion mission def");
  const missionId = def.id;

  let randomSpy: ReturnType<typeof vi.spyOn> | null = null;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = null;
  });

  it("appends success class flavor for known bodyguard class", () => {
    // roll = Math.random() * 100; high roll => success branch.
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const r = resolveMission(missionId, 200, 10, 100, "personal_guard");
    expect(r.outcome === "success" || r.outcome === "partial").toBe(true);
    expect(r.narrative).toContain("close-protection discipline");
    expect(r.narrative).not.toContain("BLAME:");
  });

  it("appends BLAME class flavor for known bodyguard class on failure", () => {
    // roll = Math.random() * 100; low roll => failure branch (always at least 2% fail floor).
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const r = resolveMission(missionId, 1, 1, 0, "shadow_agent");
    expect(r.outcome).toBe("failure");
    expect(r.narrative).toContain("BLAME:");
    expect(r.narrative).toContain("shadows weren't deep enough");
  });

  it("does not append flavor when guardClassId is omitted", () => {
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (let i = 0; i < 5; i += 1) {
      const r = resolveMission(missionId, 50, 5, 50);
      expect(r.narrative).not.toContain("close-protection discipline");
      expect(r.narrative).not.toContain("BLAME:");
    }
  });

  it("does not append flavor for unknown guardClassId", () => {
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (let i = 0; i < 5; i += 1) {
      const r = resolveMission(missionId, 50, 5, 50, "not_a_real_class");
      expect(r.narrative).not.toContain("BLAME:");
    }
  });
});
