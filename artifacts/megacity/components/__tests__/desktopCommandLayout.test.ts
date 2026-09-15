import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DESKTOP_COMMAND_BUTTON_SIZE,
  DESKTOP_COMMAND_GRID_GAP,
  DESKTOP_COMMAND_PANE_WIDTH,
  WIDE_DESKTOP_STATUS_MIN_HEIGHT,
  getCommandGridHeight,
  getCommandGridRows,
  getCommandGridWidth,
} from "@/components/desktopCommandLayout";
import { CORE_TAB_DEFS, EXTENDED_TAB_DEFS, MORE_TAB_DEF } from "@/components/topNavTabs";

const fullyUnlocked = [...CORE_TAB_DEFS, ...EXTENDED_TAB_DEFS, MORE_TAB_DEF];

describe("wide desktop command pane", () => {
  it("fits every fully unlocked destination in a fixed five-row grid", () => {
    expect(fullyUnlocked).toHaveLength(21);
    expect(getCommandGridRows(fullyUnlocked.length)).toBe(5);
    expect(getCommandGridHeight(fullyUnlocked.length)).toBe(
      5 * DESKTOP_COMMAND_BUTTON_SIZE + 4 * DESKTOP_COMMAND_GRID_GAP,
    );
    expect(getCommandGridWidth()).toBeLessThan(DESKTOP_COMMAND_PANE_WIDTH - 16);
  });

  it("gives every destination complete icon and tooltip metadata", () => {
    for (const def of fullyUnlocked) {
      expect(def.iconName, `${def.route} needs an icon`).not.toBe("");
      expect(def.description, `${def.route} needs focus and hover help`).toMatch(/^Open /);
    }
  });

  it("keeps pointer and keyboard discovery wired to the same description panel", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "components/DesktopSidebar.tsx"),
      "utf8",
    );
    expect(source).toContain("onHoverIn={() => setInspectedRoute(def.route)}");
    expect(source).toContain("onFocus={() => setInspectedRoute(def.route)}");
    expect(source).toContain("accessibilityLabel={`${def.label}. ${def.description}`}");
    expect(source).toContain('accessibilityState={{ selected: active }}');
  });

  it("removes the labeled top tab row only on wide desktop", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "components/TopNavBar.tsx"),
      "utf8",
    );
    expect(source).toContain("<CommandStatusStrip desktopCompact={isWideDesktop} />");
    expect(source).toContain("!isWideDesktop && <View style={styles.navRow}>");
    expect(WIDE_DESKTOP_STATUS_MIN_HEIGHT).toBeLessThan(48);
  });
});