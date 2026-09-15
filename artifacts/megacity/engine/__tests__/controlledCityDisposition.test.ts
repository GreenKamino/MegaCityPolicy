import { describe, expect, it } from "vitest";
import { controlledDispositionLabel } from "@/engine/partnerCityStats";

describe("controlled city disposition labels", () => {
  it("overrides occupied and annexed cities with non-hostile headlines", () => {
    expect(controlledDispositionLabel("occupied")).toBe("UNDER ADMINISTRATION");
    expect(controlledDispositionLabel("annexed")).toBe("PACIFIED");
  });

  it("leaves independent city disposition to its live relationship stats", () => {
    expect(controlledDispositionLabel("independent")).toBeNull();
    expect(controlledDispositionLabel(undefined)).toBeNull();
  });
});