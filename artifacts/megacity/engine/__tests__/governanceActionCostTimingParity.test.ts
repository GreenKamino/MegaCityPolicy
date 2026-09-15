import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  formatActionCostTiming,
  getDecreeCostTiming,
  getEdictCostTiming,
  getPolicyCostTiming,
} from "@/engine/actionCostTiming";
import { ALL_EDICTS } from "@/engine/edicts";
import { ALL_POLICIES } from "@/engine/policies";
import { POLITICAL_DECREES } from "@/engine/politicsData";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("governance action cost and timing parity", () => {
  it("derives every edict commitment from the live catalog", () => {
    for (const edict of ALL_EDICTS) {
      const model = getEdictCostTiming(edict);
      const recurring = [edict.effects.credits, edict.effects.creditsPerTick, edict.effects.tradeIncome]
        .reduce<number>((sum, value) => sum + (Number.isFinite(value) ? value! : 0), 0);

      expect(model.upfrontCostCredits, edict.id).toBe(edict.cost);
      expect(model.recurringCreditsPerTick, edict.id).toBe(recurring);
      expect(model.durationTicks, edict.id).toBe(edict.durationTicks);
      expect(model.cooldownTicks, edict.id).toBe(edict.cooldownTicks);
      expect(model.cooldownStarts, edict.id).toBe("expiry");
      expect(formatActionCostTiming(model), edict.id).toContainEqual({
        key: "maximum-cost",
        label: "MAXIMUM TOTAL COST",
        value: model.maximumTotalCostCredits
          ? `${model.maximumTotalCostCredits.toLocaleString()} cr`
          : "None",
      });
    }
  });

  it("derives every persistent policy's signed running balance", () => {
    for (const policy of ALL_POLICIES) {
      const inactive = getPolicyCostTiming(policy);
      const active = getPolicyCostTiming(policy, { active: true });

      expect(inactive.recurringCreditsPerTick, policy.id).toBe(-policy.costPerTick);
      expect(inactive.kind, policy.id).toBe("toggleable");
      expect(inactive.phase, policy.id).toBe("available");
      expect(active.phase, policy.id).toBe("active");
      expect(active.cancellation, policy.id).toBe("stops-future-costs");
      expect(formatActionCostTiming(active), policy.id).toContainEqual({
        key: "next-tick-charge",
        label: "NEXT-TICK CHARGE",
        value: policy.costPerTick > 0 ? `${policy.costPerTick.toLocaleString()} cr` : "None",
      });
    }
  });

  it("derives every decree's upfront cost and activation cooldown", () => {
    for (const decree of POLITICAL_DECREES) {
      const model = getDecreeCostTiming(decree);
      expect(model.upfrontCostCredits, decree.id).toBe(decree.cost);
      expect(model.cooldownTicks, decree.id).toBe(decree.cooldownTicks);
      expect(model.cooldownStarts, decree.id).toBe("activation");
      expect(model.kind, decree.id).toBe("instant");
    }
  });

  it("keeps all governance surfaces on the shared readout", () => {
    for (const relativePath of [
      "app/(game)/law.tsx",
      "app/(game)/overview.tsx",
      "app/(game)/character.tsx",
      "components/FaithsPanel.tsx",
    ]) {
      const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(source, relativePath).toContain("ActionCostTimingReadout");
      expect(source, relativePath).toContain("formatActionCostTimingSummary");
    }
  });
});