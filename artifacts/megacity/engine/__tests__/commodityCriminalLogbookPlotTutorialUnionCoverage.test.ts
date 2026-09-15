import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMODITY_CATEGORY_LABELS } from "@/engine/commodities";
import {
  CRIMINAL_STATUS_LABELS,
  CRIMINAL_STATUS_ORDER,
} from "@/engine/criminals";
import { TUTORIAL_TIPS } from "@/engine/tutorial";
import { BASE_ECOLOGY_BY_PLOT_CATEGORY } from "@/engine/biomes";
import type { CommodityCategory } from "@/engine/commodities";
import type { CriminalStatus } from "@/engine/criminals";
import type { TutorialTipId } from "@/engine/tutorial";
import type { PlotEcologyCategory } from "@/engine/biomes";

/**
 * Drift guard: CommodityCategory + CriminalStatus + LogbookCategoryId +
 * PlotCategory/PlotEcologyCategory parity + TutorialTipId union coverage.
 *
 *   CommodityCategory       ↔ COMMODITY_CATEGORY_LABELS Record
 *                             (typed Record<CommodityCategory,string>).
 *                             Record covers union 1:1 by key.
 *
 *   CriminalStatus(6)       ↔ CRIMINAL_STATUS_LABELS Record + 
 *                             CRIMINAL_STATUS_ORDER list. Record
 *                             covers union 1:1; list covers union
 *                             1:1 with no duplicates.
 *
 *   LogbookCategoryId(5)    ↔ CATEGORY_META Record (typed
 *                             Record<LogbookCategoryId,…>).
 *                             Source-parsed: Record covers union
 *                             1:1 by key.
 *
 *   PlotCategory(8) ≡        PlotEcologyCategory(8) — the two unions
 *   PlotEcologyCategory(8)   are duplicates by content. Drift in
 *                             either side without the other breaks
 *                             plot→ecology lookups silently.
 *                             BASE_ECOLOGY_BY_PLOT_CATEGORY Record
 *                             covers PlotEcologyCategory 1:1.
 *
 *   TutorialTipId(11)       ↔ TUTORIAL_TIPS catalog. Catalog covers
 *                             union 1:1 by .id with no duplicates;
 *                             every emitted .id a known literal.
 */

const COMM_SRC = readFileSync(join(__dirname, "..", "commodities.ts"), "utf8");
const CRIM_SRC = readFileSync(join(__dirname, "..", "criminals.ts"), "utf8");
const LOG_SRC = readFileSync(join(__dirname, "..", "logbook.ts"), "utf8");
const TUT_SRC = readFileSync(join(__dirname, "..", "tutorial.ts"), "utf8");
const DEX_SRC = readFileSync(
  join(__dirname, "..", "districtExpansion.ts"),
  "utf8",
);
const BIO_SRC = readFileSync(join(__dirname, "..", "biomes.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const COMM = parseUnion(COMM_SRC, "CommodityCategory");
const CRIM = parseUnion(CRIM_SRC, "CriminalStatus");
const LOG = parseUnion(LOG_SRC, "LogbookCategoryId");
const PLOT = parseUnion(DEX_SRC, "PlotCategory");
const PLOT_ECO = parseUnion(BIO_SRC, "PlotEcologyCategory");
const TUT = parseUnion(TUT_SRC, "TutorialTipId");

describe("commodity / criminal / logbook / plot / tutorial union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(COMM.length).toBe(39);
    expect(CRIM.length).toBe(6);
    expect(LOG.length).toBe(5);
    expect(PLOT.length).toBe(8);
    expect(PLOT_ECO.length).toBe(8);
    expect(TUT.length).toBe(11);
  });

  it("CommodityCategory — COMMODITY_CATEGORY_LABELS Record covers union 1:1", () => {
    const keys = Object.keys(COMMODITY_CATEGORY_LABELS);
    expect(keys.length).toBe(COMM.length);
    for (const lit of COMM) {
      expect(
        (COMMODITY_CATEGORY_LABELS as Record<string, string>)[lit],
        `COMMODITY_CATEGORY_LABELS missing ${lit}`,
      ).toBeDefined();
    }
    for (const k of keys) {
      expect(COMM, `unknown CommodityCategory ${k}`).toContain(k);
    }
    const sample: CommodityCategory = "metals";
    expect(COMM).toContain(sample);
  });

  it("CriminalStatus — CRIMINAL_STATUS_LABELS Record + CRIMINAL_STATUS_ORDER list cover union 1:1", () => {
    expect(Object.keys(CRIMINAL_STATUS_LABELS).length).toBe(CRIM.length);
    for (const lit of CRIM) {
      expect(
        (CRIMINAL_STATUS_LABELS as Record<string, string>)[lit],
        `CRIMINAL_STATUS_LABELS missing ${lit}`,
      ).toBeDefined();
    }
    expect(new Set(CRIMINAL_STATUS_ORDER).size).toBe(
      CRIMINAL_STATUS_ORDER.length,
    );
    expect(CRIMINAL_STATUS_ORDER.length).toBe(CRIM.length);
    for (const lit of CRIM) {
      expect(
        CRIMINAL_STATUS_ORDER,
        `CRIMINAL_STATUS_ORDER missing ${lit}`,
      ).toContain(lit);
    }
    const sample: CriminalStatus = "wanted";
    expect(CRIM).toContain(sample);
  });

  it("LogbookCategoryId — CATEGORY_META Record (source-parsed) covers union 1:1", () => {
    const m = LOG_SRC.match(
      /CATEGORY_META\s*:\s*Record<LogbookCategoryId[\s\S]*?>\s*=\s*\{([\s\S]*?)\n\};/,
    );
    expect(m, "CATEGORY_META Record block not found").not.toBeNull();
    const keys = Array.from(m![1].matchAll(/^\s*(\w+)\s*:/gm)).map(
      (mm) => mm[1],
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(LOG.length);
    for (const lit of LOG) {
      expect(keys, `CATEGORY_META missing ${lit}`).toContain(lit);
    }
    for (const k of keys) {
      expect(LOG, `unknown LogbookCategoryId ${k}`).toContain(k);
    }
  });

  it("PlotCategory ≡ PlotEcologyCategory — duplicate unions stay in lockstep + BASE_ECOLOGY_BY_PLOT_CATEGORY Record covers them 1:1", () => {
    expect(new Set(PLOT)).toEqual(new Set(PLOT_ECO));
    const ecoKeys = Object.keys(BASE_ECOLOGY_BY_PLOT_CATEGORY);
    expect(ecoKeys.length).toBe(PLOT_ECO.length);
    for (const lit of PLOT_ECO) {
      expect(
        (BASE_ECOLOGY_BY_PLOT_CATEGORY as Record<string, number>)[lit],
        `BASE_ECOLOGY_BY_PLOT_CATEGORY missing ${lit}`,
      ).toBeDefined();
    }
    for (const k of ecoKeys) {
      expect(PLOT_ECO, `unknown PlotEcologyCategory ${k}`).toContain(k);
    }
    const sample: PlotEcologyCategory = "hydroponic_sector";
    expect(PLOT_ECO).toContain(sample);
  });

  it("TutorialTipId — TUTORIAL_TIPS catalog covers union 1:1 by .id", () => {
    const ids = TUTORIAL_TIPS.map((t) => t.id);
    expect(new Set(ids).size, "TUTORIAL_TIPS has duplicate ids").toBe(
      ids.length,
    );
    expect(ids.length).toBe(TUT.length);
    for (const lit of TUT) {
      expect(ids, `TUTORIAL_TIPS missing ${lit}`).toContain(lit);
    }
    for (const id of ids) {
      expect(TUT, `unknown TutorialTipId ${id}`).toContain(id);
    }
    const sample: TutorialTipId = "welcome";
    expect(TUT).toContain(sample);
  });
});
