/**
 * Task #560 — Collapsible Active Incidents on the CITY tab.
 *
 * A player with 15+ active events had to scroll past the whole incident list
 * to reach the City Status Matrix (law, food, corruption, stability). The
 * Active Incidents header is now a drop-down toggle, mirroring the Law tab's
 * collapsible edict category headers.
 *
 * app/(game)/overview.tsx is an un-importable Expo screen module in node
 * vitest, so these are source pins (same readFileSync approach used by
 * healthBreakdown/transitBreakdown/employmentBreakdown tests). They keep the
 * collapse contract from silently regressing:
 *   1. the list starts expanded,
 *   2. collapsing actually hides the event cards,
 *   3. the header stays tappable with proper accessibility state,
 *   4. a collapsed list still surfaces how many incidents need a response,
 *   5. the response-required banner (the other route to urgent events)
 *      stays wired above the section.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const screenSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

const overviewSource = screenSource("../../app/(game)/overview.tsx");

describe("overview Active Incidents drop-down (Task #560)", () => {
  it("starts expanded — the section only collapses when the player asks", () => {
    expect(overviewSource).toContain(
      "const [incidentsCollapsed, setIncidentsCollapsed] = useState(false);",
    );
  });

  it("collapsing hides the event cards (the map is gated on the toggle)", () => {
    expect(overviewSource).toMatch(
      /\{!incidentsCollapsed && state\.activeEvents\.map\(\(e\) => \(\s*\n\s*<EventCard/,
    );
  });

  it("the header is a toggle with accessibility expanded state", () => {
    expect(overviewSource).toContain(
      "onPress={() => setIncidentsCollapsed((prev) => !prev)}",
    );
    expect(overviewSource).toContain(
      "accessibilityState={{ expanded: !incidentsCollapsed }}",
    );
    // Chevron flips with the state, like the Law tab category headers.
    expect(overviewSource).toContain(
      'incidentsCollapsed ? "chevron-down" : "chevron-up"',
    );
  });

  it("a collapsed list still shows how many incidents need a response", () => {
    // Badge renders only while collapsed (expanded lists show the cards
    // themselves), and its count comes from the same responseOptions filter
    // the response-required banner uses.
    expect(overviewSource).toContain("incidentsCollapsed && respondCount > 0");
    expect(overviewSource).toMatch(
      /respondCount = state\.activeEvents\.filter\(\(e\) => e\.responseOptions && e\.responseOptions\.length > 0\)\.length/,
    );
    expect(overviewSource).toMatch(
      /\{respondCount\} NEED\{respondCount === 1 \? "S" : ""\} RESPONSE/,
    );
  });

  it("the response-required banner above the section stays wired to the events screen", () => {
    // Even fully collapsed, urgent events keep their existing one-tap route.
    expect(overviewSource).toContain('onPress={() => router.push("/(game)/events")}');
    expect(overviewSource).toContain("responseEvents.length > 0 ? responseEvents : criticalEvents");
    expect(overviewSource).toContain("OPEN EVENTS");
    expect(overviewSource).toContain("CRITICAL EVENT");
  });

  it("player-facing copy in the section carries no exclamation marks or emojis", () => {
    const copy = ["Tap to expand", "Requires attention", "NEED", "RESPONSE", "Active Incidents"];
    for (const line of copy) {
      expect(overviewSource).toContain(line);
      expect(line).not.toMatch(/!/);
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});
