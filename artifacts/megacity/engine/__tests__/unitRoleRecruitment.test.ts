import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { UNIT_CATEGORIES } from "@/engine/contracts";
import { CLASS_DEFS } from "@/engine/retinueData";
import { getUnitRole, isUnitRole, UNIT_ROLE_ORDER, summarizeTroopRoles } from "@/engine/unitRoles";

const RECRUITMENT_SRC = readFileSync(
  join(__dirname, "../../app/(game)/recruitment.tsx"),
  "utf8",
);
const RETINUE_SRC = readFileSync(
  join(__dirname, "../../app/(game)/retinue.tsx"),
  "utf8",
);

describe("recruitment unit role summaries", () => {
  it("requires valid explicit role metadata for every recruitable catalog entry", () => {
    const invalidRoleMetadata = UNIT_CATEGORIES
      .filter((def) => !isUnitRole(def.battlefieldRole))
      .map((def) => `${def.key} (${def.label}; ${String(def.battlefieldRole)})`);

    expect(
      invalidRoleMetadata,
      "Every UNIT_CATEGORIES entry needs valid battlefieldRole metadata. Invalid entries:",
    ).toEqual([]);
  });

  it("falls back when legacy or malformed role metadata is absent", () => {
    expect(getUnitRole({ label: "Emergency Medical Team", battlefieldRole: undefined })).toBe("MEDICAL SUPPORT");
    expect(getUnitRole({ category: "Military", battlefieldRole: "NOT_A_ROLE" })).toBe("FRONTLINE");
    expect(getUnitRole({ category: "Unknown", battlefieldRole: "NOT_A_ROLE" })).toBeNull();
  });

  it("prefers a valid explicit role over inferred text", () => {
    expect(getUnitRole({
      label: "Emergency Medical Team",
      category: "Medical & Disaster",
      battlefieldRole: "LOGISTICS",
    })).toBe("LOGISTICS");
  });

  it("uses specific existing descriptions to distinguish representative roles", () => {
    const roleFor = (key: string) => {
      const def = UNIT_CATEGORIES.find((entry) => entry.key === key);
      expect(def, `${key} is missing from UNIT_CATEGORIES`).toBeDefined();
      return getUnitRole(def!);
    };

    expect(roleFor("emergencyMedicalTeams")).toBe("MEDICAL SUPPORT");
    expect(roleFor("wastelandScouts")).toBe("RECONNAISSANCE");
    expect(roleFor("urbanDefenseEngineers")).toBe("ENGINEERING");
    expect(roleFor("heavyWeaponsSquads")).toBe("RANGED");
    expect(roleFor("cityDefenseInfantry")).toBe("FRONTLINE");
  });

  it("renders the role line without removing the existing recruitment actions", () => {
    expect(RECRUITMENT_SRC).toContain("{unitRole && <Text style={styles.cardRole}>ROLE · {unitRole}</Text>}");
    expect(RECRUITMENT_SRC).toContain("onPress={() => handleDismiss(def)}");
    expect(RECRUITMENT_SRC).toContain("onPress={() => handleHire(def)}");
  });

  it("exposes every battlefield role in a stable filter order", () => {
    expect(UNIT_ROLE_ORDER).toHaveLength(9);
    expect(new Set(UNIT_ROLE_ORDER).size).toBe(UNIT_ROLE_ORDER.length);
    expect(UNIT_ROLE_ORDER.every((role) => UNIT_CATEGORIES.some((def) => getUnitRole(def) === role))).toBe(true);
  });

  it("combines the role filter with category tabs and keeps an all-roles option", () => {
    expect(RECRUITMENT_SRC).toContain('const [selectedRole, setSelectedRole] = useState<UnitRole | "ALL">("ALL");');
    expect(RECRUITMENT_SRC).toContain('(selectedRole === "ALL" || getUnitRole(u) === selectedRole)');
    expect(RECRUITMENT_SRC).toContain("ALL ROLES");
    expect(RECRUITMENT_SRC).toContain("onPress={() => setSelectedRole(role)}");
  });

  it("resolves every retinue class through the same canonical role resolver", () => {
    expect(CLASS_DEFS.every((def) => getUnitRole(def) === def.battlefieldRole)).toBe(true);
    expect(summarizeTroopRoles([
      { classId: "infantry" },
      { classId: "marksman" },
      { classId: "medic" },
      { classId: "engineer" },
      { classId: "missing-class" as never },
    ])).toMatchObject({
      FRONTLINE: 1,
      RANGED: 1,
      "MEDICAL SUPPORT": 1,
      ENGINEERING: 1,
    });
  });

  it("shows role coverage for both squad and reserve loadouts", () => {
    expect(RETINUE_SRC).toContain('title="BATTLEFIELD ROLE COVERAGE"');
    expect(RETINUE_SRC).toContain('title="RESERVE ROLE COVERAGE"');
    expect(RETINUE_SRC).toContain("const reserveTroops = ret.troops.filter");
    expect(RETINUE_SRC).toContain("UNIT_ROLE_SHORT_LABEL[role]");
  });
});