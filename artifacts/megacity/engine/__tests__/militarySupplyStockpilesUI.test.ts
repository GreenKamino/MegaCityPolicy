import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const screenSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/(game)/military.tsx"),
  "utf8",
);

describe("Military supply stockpile presentation", () => {
  it("separates top-level reserves from open-ended logistics entries", () => {
    expect(screenSource).toContain('testID="military-top-level-reserves"');
    expect(screenSource).toContain('testID="military-logistics-stockpiles"');
    expect(screenSource).toContain('testID={`military-top-level-reserve-row-${row.key}`}');
    expect(screenSource).toContain('testID={`military-logistics-stockpile-row-${row.key}`}');
    expect(screenSource).toContain("Entries remain independent per-item balances.");
  });

  it("keeps each displayed balance on its authoritative accounting path", () => {
    expect(screenSource).toContain('path: "resources.ammo"');
    expect(screenSource).toContain('path: "resources.fuel"');
    expect(screenSource).toContain('path: "resources.food"');
    expect(screenSource).toContain("stockpiles.{row.key}");
    expect(screenSource).toContain('testID="military-rations-accounting"');
    expect(screenSource).toContain("RATIONS ARE NOT A SEPARATE STOCKPILE ITEM");
    expect(screenSource).toContain("getLogisticsStockpileBalance(state, row.key)");
  });

  it("does not render a per-item capacity for open-ended stockpile rows", () => {
    const stockpileStart = screenSource.indexOf('testID="military-logistics-stockpiles"');
    const rationNoteStart = screenSource.indexOf('<Text testID="military-rations-accounting"', stockpileStart);
    const stockpileRowsSource = screenSource.slice(stockpileStart, rationNoteStart);

    expect(stockpileRowsSource).toContain("getLogisticsStockpileBalance(state, row.key)");
    expect(stockpileRowsSource).not.toContain("capacity");
    expect(stockpileRowsSource).not.toContain(" / ");
  });
});