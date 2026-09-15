import { describe, expect, it } from "vitest";

import {
  COMMAND_DESTINATIONS,
  COMMAND_MENU_GROUPS,
  getUnlockedCommandDestinations,
  searchCommandDestinations,
} from "@/engine/commandMenuCatalog";
import { getCommandMenuStatuses } from "@/engine/commandMenuStatus";
import { createInitialState } from "@/engine/initialState";

describe("command destination catalog", () => {
  it("keeps stable unique destination ids and routes in five player-intent groups", () => {
    expect(new Set(COMMAND_DESTINATIONS.map((item) => item.id)).size).toBe(COMMAND_DESTINATIONS.length);
    expect(new Set(COMMAND_DESTINATIONS.map((item) => item.route)).size).toBe(COMMAND_DESTINATIONS.length);
    expect(COMMAND_MENU_GROUPS.map((group) => group.label)).toEqual([
      "Command & Intelligence",
      "Operations",
      "Governance",
      "World",
      "Commander Tools",
    ]);
    expect(new Set(COMMAND_DESTINATIONS.map((item) => item.group))).toEqual(
      new Set(COMMAND_MENU_GROUPS.map((group) => group.id)),
    );
  });

  it.each([
    ["law", "law"],
    ["money", "economy"],
    ["officers", "officers"],
    ["crises", "events"],
    ["sectors", "districts"],
    ["research", "research"],
  ])("finds the expected destination for the %s alias", (query, expectedId) => {
    expect(searchCommandDestinations(query).map((item) => item.id)).toContain(expectedId);
  });

  it("filters palette results through progressive HUD unlocks", () => {
    const state = createInitialState();
    state.hasCompletedOnboarding = false;
    state.onboardingStep = "arrival";
    state.didBuild = false;
    state.didEdict = false;
    state.didRead = false;

    const arrival = getUnlockedCommandDestinations(state);
    expect(arrival.map((item) => item.id)).toEqual(["city"]);
    expect(arrival.some((item) => item.id === "debug")).toBe(false);

    state.onboardingStep = "summary";
    state.didBuild = true;
    state.didEdict = true;
    state.didRead = true;
    const summaryIds = getUnlockedCommandDestinations(state).map((item) => item.id);
    expect(summaryIds).toEqual(expect.arrayContaining(["city", "law", "economy", "construction", "inbox", "research"]));
    expect(summaryIds).not.toContain("more");

    state.hasCompletedOnboarding = true;
    expect(getUnlockedCommandDestinations(state)).toHaveLength(COMMAND_DESTINATIONS.length);
  });

  it("has a catalog destination for every status emitted by the shared source", () => {
    const statuses = getCommandMenuStatuses(createInitialState(), "2026-08-30");
    for (const route of Object.keys(statuses)) {
      expect(
        COMMAND_DESTINATIONS.some((item) => (item.statusRoute ?? item.route) === route),
      ).toBe(true);
    }
  });

  it("publishes hotkeys from the same records the palette renders", () => {
    expect(COMMAND_DESTINATIONS.find((item) => item.id === "city")?.hotkey).toBe("1");
    expect(COMMAND_DESTINATIONS.find((item) => item.id === "research")?.hotkey).toBe("⇧3");
    expect(COMMAND_DESTINATIONS.find((item) => item.id === "codex")?.hotkey).toBe("⇧9");
  });
});