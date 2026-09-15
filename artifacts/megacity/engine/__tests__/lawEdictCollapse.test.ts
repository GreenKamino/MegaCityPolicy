/**
 * Source pins for the collapsible edict category groups on the Law tab
 * (app/(game)/law.tsx is an un-importable Expo screen module, so we assert
 * against its source text — same pattern as the breakdown-card wiring pins).
 *
 * Contract under test:
 * 1. Edict cards render ONLY when their category is expanded (collapsed by
 *    default keeps the ~103-edict list scannable).
 * 2. The category header is a tappable control that toggles the expanded map.
 * 3. Collapsed headers still surface active/cooldown presence via badges so a
 *    running edict is never invisible.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lawSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/(game)/law.tsx"),
  "utf8",
);

describe("law tab edict category collapse wiring (source pins)", () => {
  it("renders a category's edict cards only when that category is expanded", () => {
    expect(lawSource).toContain("{isExpanded && edictsInCategory.map((edict) => {");
    expect(lawSource).toContain("const isExpanded = !!expandedEdictCats[category];");
  });

  it("toggles the category via a pressable header with a state map", () => {
    expect(lawSource).toContain(
      "useState<Record<string, boolean>>({})",
    );
    expect(lawSource).toContain(
      "setExpandedEdictCats((prev) => ({ ...prev, [category]: !prev[category] }))",
    );
    // The toggle lives on a Pressable header with an accessible expand/collapse label.
    expect(lawSource).toMatch(/accessibilityLabel=\{`\$\{EDICT_CATEGORY_LABELS\[category\]\} edicts/);
  });

  it("keeps active and cooldown presence visible on collapsed headers", () => {
    expect(lawSource).toContain("activeCount > 0 && (");
    expect(lawSource).toContain("cooldownCount > 0 && (");
    // Cooldown badge must not double-count edicts that are currently active.
    expect(lawSource).toContain("!activeIds.has(e.id) && until > state.totalTicks");
  });

  it("header shows the category label with its edict count", () => {
    expect(lawSource).toContain("{EDICT_CATEGORY_LABELS[category]} — {edictsInCategory.length}");
  });
});
