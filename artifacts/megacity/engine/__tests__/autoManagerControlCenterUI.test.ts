import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Auto-Manager Control Center UI", () => {
  it("surfaces specialized manager state and routes to their authoritative screens", () => {
    const source = read("app/(game)/advisor-briefings.tsx");
    const moreSource = read("app/(game)/more.tsx");
    const commandSource = read("engine/commandMenuCatalog.ts");

    expect(source).toContain("AUTO-MANAGER CONTROL CENTER");
    expect(source).toContain("SPECIALIZED MANAGERS");
    expect(source).toContain("AUTO-RECRUIT");
    expect(source).toContain("AUTO-CONSTRUCTION");
    expect(source).toContain("getMaxRetinueStrength(state)");
    expect(source).toContain("recruitConfig.targetStrengthPercent");
    expect(source).toContain("recruitConfig.budgetPerTick");
    expect(source).toContain("constructionConfig.budgetPerTick");
    expect(source).toContain('router.push("/(game)/recruitment" as any)');
    expect(source).toContain('router.push("/(game)/construction" as any)');
    expect(moreSource).toContain('label: "AUTO-MANAGER CONTROL CENTER"');
    expect(commandSource).toContain('"AUTO-MANAGER CONTROL CENTER"');
  });

  it("keeps the recruit manager out of the duplicate officer-mode list", () => {
    const source = read("app/(game)/advisor-briefings.tsx");
    const launchSource = read("app/index.tsx");

    expect(source).toContain('AUTO_MANAGER_DOMAINS.filter((domain) => domain !== "recruit")');
    expect(source).toContain("Advisor Domain Modes");
    expect(source).toContain("Pending Briefings");
    expect(source).toContain("PAUSE ALL ACT-MODE");
    expect(launchSource).toContain('"advisor-briefings"');
  });
});