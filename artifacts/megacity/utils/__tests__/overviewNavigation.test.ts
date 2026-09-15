import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
}));

import { router } from "expo-router";

import { navigateToOverviewWarning } from "@/utils/overviewNavigation";

describe("overview warning navigation", () => {
  beforeEach(() => {
    vi.mocked(router.push).mockClear();
  });

  it("opens construction warnings in the requested category with a fresh link nonce", () => {
    navigateToOverviewWarning({ screen: "construction", category: "food" });
    navigateToOverviewWarning({ screen: "construction", category: "food" });

    expect(router.push).toHaveBeenNthCalledWith(1, {
      pathname: "/(game)/construction",
      params: { category: "food", hl: "1" },
    });
    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: "/(game)/construction",
      params: { category: "food", hl: "2" },
    });
  });

  it.each([
    ["law", "/(game)/law"],
    ["economy", "/(game)/economy"],
    ["districts", "/(game)/districts"],
    ["military", "/(game)/military"],
    ["wildlands", "/(game)/wildlands"],
  ] as const)("opens %s warnings on the matching screen", (screen, route) => {
    navigateToOverviewWarning({ screen });
    expect(router.push).toHaveBeenCalledWith(route);
  });
});