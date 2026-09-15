import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatCompactMetricValue } from "@/utils/compactMetricValue";

describe("City summary infrastructure totals", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1K"],
    [12_345, "12.3K"],
    [999_999, "1M"],
    [1_000_000, "1M"],
    [12_345_678, "12.3M"],
    [1_234_567_890, "1.2B"],
  ])("formats %s compactly as %s", (value, expected) => {
    expect(formatCompactMetricValue(value)).toBe(expected);
  });

  it("keeps exact infrastructure counts in accessible labels", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "app/(game)/summary.tsx"),
      "utf8",
    );
    for (const field of [
      "buildingsCount",
      "uniqueBuildingTypes",
      "districtsCount",
      "unitsCount",
    ]) {
      expect(source).toContain(`formatCompactMetricValue(r.infrastructure.${field})`);
      expect(source).toContain(`Math.round(r.infrastructure.${field}).toLocaleString()`);
    }
    expect(source).toContain("accessibilityLabel={`${label}: ${exactValue ?? value}`}");
  });

  it("keeps compact values on one shrinkable line at enlarged text sizes", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "app/(game)/summary.tsx"),
      "utf8",
    );
    expect(source).toContain("numberOfLines={1}");
    expect(source).toContain("adjustsFontSizeToFit");
    expect(source).toContain("minimumFontScale={0.6}");
    expect(source).toMatch(/smallStatValue:[\s\S]*?flexShrink: 1,[\s\S]*?minWidth: 0,/);
  });
});