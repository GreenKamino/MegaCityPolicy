import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const wildlandsSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/(game)/wildlands.tsx",
  ),
  "utf8",
);

describe("Wildlands biosphere trend surface", () => {
  it("uses the shared biosphere trend signal instead of duplicating its rules", () => {
    expect(wildlandsSource).toContain('import { getBiosphereTrend } from "@/engine/biosphereTrend";');
    expect(wildlandsSource).toContain("const trend = getBiosphereTrend(state);");
    expect(wildlandsSource).toContain("BIOSPHERE · {trend.label}");
    expect(wildlandsSource).toContain("{trend.headline}");
    expect(wildlandsSource).toContain("{trend.detail}");
  });

  it("exposes the signal to assistive technology", () => {
    expect(wildlandsSource).toContain("accessibilityRole=\"text\"");
    expect(wildlandsSource).toContain("accessibilityLabel={`Biosphere ${trend.label}.");
  });
});