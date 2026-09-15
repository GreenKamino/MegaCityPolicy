import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const constructionSource = readFileSync(
  resolve(__dirname, "../../app/(game)/construction.tsx"),
  "utf8",
);

describe("construction building operating status", () => {
  it("uses the live worker multiplier and current assignments", () => {
    expect(constructionSource).toContain("getProducerStaffing(");
    expect(constructionSource).toContain('label: "LIMITED — NO STAFF"');
    expect(constructionSource).toContain("staffing.multiplier < 1");
    expect(constructionSource).toContain("staffing.workerCount");
  });

  it("checks the same per-cycle input demand used by the supply chain", () => {
    expect(constructionSource).toContain("const required = input.qty * count");
    expect(constructionSource).toContain("(stockpiles[input.id] ?? 0) < required");
    expect(constructionSource).toContain("required for this cycle");
  });

  it("only reports live performance for constructed production buildings", () => {
    expect(constructionSource).toContain("if (count <= 0) return null");
    expect(constructionSource).toContain("if (recipes.length === 0) return null");
    expect(constructionSource).toContain("OPERATING AT BASE RATE");
    expect(constructionSource).toContain("STAFFED —");
  });
});