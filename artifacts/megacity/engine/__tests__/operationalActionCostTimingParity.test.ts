import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  getTimedActionCostTiming,
} from "@/engine/actionCostTiming";
import { OFFICER_MISSIONS } from "@/engine/officerMissions";
import {
  MILITARY_MISSIONS,
  MILITARY_RESEARCH,
} from "@/engine/militaryOverhaul";
import { getWarRoomOpDuration, WAR_ROOM_OPS } from "@/engine/warRoomData";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("operational action cost and timing parity", () => {
  it("derives every officer mission commitment from its live definition", () => {
    for (const mission of OFFICER_MISSIONS) {
      const model = getTimedActionCostTiming({
        cost: mission.creditsCost,
        duration: mission.duration,
      });

      expect(model.upfrontCostCredits, mission.id).toBe(mission.creditsCost);
      expect(model.durationTicks, mission.id).toBe(mission.duration);
      expect(model.maximumTotalCostCredits, mission.id).toBe(mission.creditsCost);
      expect(model.phase, mission.id).toBe("available");
    }
  });

  it("derives every military mission commitment from its live definition", () => {
    for (const mission of MILITARY_MISSIONS) {
      const model = getTimedActionCostTiming({
        cost: mission.creditsCost,
        duration: mission.duration,
      });

      expect(model.upfrontCostCredits, mission.id).toBe(mission.creditsCost);
      expect(model.durationTicks, mission.id).toBe(mission.duration);
      expect(model.maximumTotalCostCredits, mission.id).toBe(mission.creditsCost);
    }
  });

  it("uses one authoritative duration rule for every war-room operation", () => {
    for (const operation of WAR_ROOM_OPS) {
      const duration = getWarRoomOpDuration(operation);
      const model = getTimedActionCostTiming({
        cost: operation.cost,
        duration,
      });

      expect(duration, operation.id).toBeGreaterThanOrEqual(2);
      expect(model.durationTicks, operation.id).toBe(duration);
      expect(model.maximumTotalCostCredits, operation.id).toBe(operation.cost);
    }
  });

  it("derives every military research commitment from its live definition", () => {
    for (const research of MILITARY_RESEARCH) {
      const model = getTimedActionCostTiming({
        cost: research.cost,
        duration: research.ticksToComplete,
      });

      expect(model.upfrontCostCredits, research.id).toBe(research.cost);
      expect(model.durationTicks, research.id).toBe(research.ticksToComplete);
      expect(model.maximumTotalCostCredits, research.id).toBe(research.cost);
    }
  });

  it("keeps operational screens on the shared readout", () => {
    for (const relativePath of [
      "app/(game)/military.tsx",
      "app/(game)/missions.tsx",
    ]) {
      const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(source, relativePath).toContain("ActionCostTimingReadout");
      expect(source, relativePath).toContain("getTimedActionCostTiming");
    }
  });
});