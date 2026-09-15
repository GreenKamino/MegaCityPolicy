import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Sector Command city UI", () => {
  it("keeps the global command strip attached to the existing top navigation", () => {
    const topNav = read("components/TopNavBar.tsx");
    const statusStrip = read("components/CommandStatusStrip.tsx");

    expect(topNav).toContain("<CommandStatusStrip desktopCompact={isWideDesktop} />");
    expect(statusStrip).toContain("PAUSED · ${status.severity.toUpperCase()}");
    expect(statusStrip).toContain("status.threatCount");
    expect(statusStrip).toContain("COUNTERMEASURES REQUIRED");
    expect(statusStrip).toContain('pathname: "/(game)/construction"');
    expect(statusStrip).toContain('router.push("/(game)/economy")');
    expect(statusStrip).toContain('key === "power" ? "energy" : key');
    expect(statusStrip).toContain('import { formatDateShort } from "@/engine/clock"');
    expect(statusStrip).toContain("const dayNumber = Math.floor(Math.max(0, tick) / 4) + 1;");
    expect(statusStrip).toContain("DAY {String(dayNumber).padStart(3, \"0\")} · {dateLabel}");
    for (const resource of ["CREDITS", "FOOD", "WATER", "POWER"]) {
      expect(statusStrip).toContain(`label="${resource}"`);
    }
  });

  it("uses the shared command header on the major management screens", () => {
    const screens = [
      "construction",
      "law",
      "military",
      "wildlands",
      "factions",
      "economy",
      "events",
    ];

    for (const screen of screens) {
      const source = read(`app/(game)/${screen}.tsx`);
      expect(source, screen).toContain('from "@/components/CommandScreenHeader"');
      expect(source, screen).toContain("<CommandScreenHeader");
    }
  });

  it("uses the approved severity language without changing routes or simulation code", () => {
    const statusStrip = read("components/CommandStatusStrip.tsx");
    const reportFrame = read("components/CrisisReportFrame.tsx");
    const sidebar = read("components/DesktopSidebar.tsx");

    for (const label of ["stable", "strained", "critical", "collapsing"]) {
      expect(statusStrip).toContain(label);
    }
    expect(reportFrame).toContain("IMPACT / FAILURE MODE");
    expect(reportFrame).toContain("AVAILABLE COUNTERMEASURES");
    expect(sidebar).toContain("CORE_TAB_DEFS");
    expect(sidebar).toContain("EXTENDED_TAB_DEFS");
    expect(sidebar).toContain("router.replace(def.route");
  });

  it("keeps the wide sidebar compact and leaves the live comms region flexible", () => {
    const sidebar = read("components/DesktopSidebar.tsx");
    const layout = read("components/desktopCommandLayout.ts");
    const chatter = read("components/CommsChatter.tsx");

    expect(layout).toContain("DESKTOP_COMMAND_PANE_WIDTH = 248");
    expect(layout).toContain("DESKTOP_COMMAND_GRID_COLUMNS = 5");
    expect(layout).toContain("DESKTOP_COMMAND_BUTTON_SIZE = 40");
    expect(sidebar).toContain('testID="desktop-command-grid"');
    expect(sidebar).toContain("flexWrap: \"wrap\"");
    expect(sidebar).toContain("onHoverIn={() => setInspectedRoute(def.route)}");
    expect(sidebar).toContain("onFocus={() => setInspectedRoute(def.route)}");
    expect(sidebar).toContain('accessibilityLabel="Open command palette"');
    expect(sidebar).toContain('accessibilityLabel="Show keyboard shortcuts"');
    expect(sidebar).toContain("commsArea: {");
    expect(sidebar).toContain("flex: 1");
    expect(sidebar).toContain("<CommsChatter />");
    expect(sidebar).not.toContain("DESKTOP MODE");
    expect(sidebar).not.toContain("Sidebar visible at viewport");
    expect(sidebar).not.toContain("Press ? for keyboard shortcuts");

    // The below-breakpoint strip remains the fixed two-line treatment.
    expect(chatter).toContain("<View testID={compact ? \"comms-chatter-compact\" : \"comms-chatter\"}");
    expect(chatter).toContain("compactContainer: {");
    expect(chatter).toContain("height: 30");
    expect(chatter).toContain("const visibleLines = compact ? lines.slice(-2) : lines;");
  });

  it("keeps explicit casualty-reduction language on representative command reports", () => {
    const sources = [
      read("app/(game)/economy.tsx"),
      read("app/(game)/events.tsx"),
      read("app/(game)/law.tsx"),
      read("app/(game)/military.tsx"),
      read("app/(game)/wildlands.tsx"),
    ].join("\n");

    expect(sources).toMatch(/casualt/i);
    expect(sources).toMatch(/deaths?/i);
    expect(sources).toContain("It cannot make an inbound threat harmless.");
  });
});