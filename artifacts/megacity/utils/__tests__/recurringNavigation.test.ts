import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { push },
}));

import { navigateToRecurrenceFix } from "@/utils/recurringNavigation";

describe("repeat crisis navigation", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("opens Wildlands without changing the active event", () => {
    navigateToRecurrenceFix({ screen: "wildlands" });

    expect(push).toHaveBeenCalledWith("/(game)/wildlands");
  });

  it("opens the Biosphere construction category and highlight", () => {
    navigateToRecurrenceFix({
      screen: "construction",
      category: "biosphere",
      highlight: "atmosphericBiofilterStations",
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({
      pathname: "/(game)/construction",
      params: {
        category: "biosphere",
        highlight: "atmosphericBiofilterStations",
      },
    });
    expect(push.mock.calls[0][0].params.hl).toEqual(expect.any(String));
  });

  it("opens the Officers roster without changing the active event", () => {
    navigateToRecurrenceFix({ screen: "officers" });

    expect(push).toHaveBeenCalledWith("/(game)/officers");
  });
});