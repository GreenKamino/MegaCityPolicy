import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  countTemplates,
  generatePropagandaFeed,
  listTemplateMetadata,
} from "@/engine/propaganda";
import type { PropagandaTone } from "@/engine/propaganda";
import { createInitialState } from "@/engine/initialState";

/**
 * Catalog budget + tone-balance pin for engine/propaganda.ts.
 *
 * The propaganda feed is one of the most player-visible flavor
 * surfaces — it renders into the propaganda screen on every visit.
 * Originally the template pool was heavily skewed toward the
 * "triumphant" tone (8 of 15 templates), which meant a city in any
 * non-flattering state cycled through the same handful of lines.
 *
 * Pins:
 *   - countTemplates() ≥ 25 (budget floor; raise as we author more).
 *   - Every PropagandaTone has ≥3 templates so no tone is one-line-
 *     and-out.
 *   - Template ids are unique.
 *   - Every template's source is a non-empty all-caps string drawn
 *     from the canonical SOURCES set.
 *   - generatePropagandaFeed on a fresh state returns ≥1 item with
 *     non-empty headline and body.
 *   - PropagandaTone union itself is budget-pinned to 5 members
 *     (sibling check; mirrors the existing drift-guard style).
 */

const PROP_SRC = readFileSync(join(__dirname, "..", "propaganda.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const TONES = parseUnion(PROP_SRC, "PropagandaTone") as PropagandaTone[];
const CANONICAL_SOURCES = new Set([
  "MINISTRY OF TRUTH",
  "CITY HERALD",
  "PUBLIC NETCAST",
  "VOICE OF THE PEOPLE",
  "GUARD BULLETIN",
]);

describe("propaganda template catalog", () => {
  it("template pool meets the 25-entry budget floor", () => {
    expect(countTemplates()).toBeGreaterThanOrEqual(25);
  });

  it("every PropagandaTone is represented by ≥3 templates", () => {
    const meta = listTemplateMetadata();
    const counts: Record<string, number> = {};
    for (const m of meta) {
      counts[m.tone] = (counts[m.tone] ?? 0) + 1;
    }
    for (const tone of TONES) {
      expect(
        counts[tone] ?? 0,
        `tone ${tone} has only ${counts[tone] ?? 0} templates`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("template ids are unique and non-empty", () => {
    const meta = listTemplateMetadata();
    const ids = meta.map((m) => m.id);
    expect(new Set(ids).size, "duplicate template ids").toBe(ids.length);
    for (const id of ids) {
      expect(id.length, "empty template id").toBeGreaterThan(0);
    }
  });

  it("every template source is drawn from the canonical SOURCES set", () => {
    for (const m of listTemplateMetadata()) {
      expect(
        CANONICAL_SOURCES.has(m.source),
        `template ${m.id} uses non-canonical source "${m.source}"`,
      ).toBe(true);
    }
  });

  it("generatePropagandaFeed returns ≥1 well-formed item on a fresh state", () => {
    const state = createInitialState();
    const feed = generatePropagandaFeed(state, 12);
    expect(feed.length).toBeGreaterThan(0);
    for (const item of feed) {
      expect(item.headline.length, `empty headline in ${item.id}`).toBeGreaterThan(
        0,
      );
      expect(item.body.length, `empty body in ${item.id}`).toBeGreaterThan(0);
      expect(TONES, `unknown tone in ${item.id}`).toContain(item.tone);
    }
  });

  it("PropagandaTone union is budget-pinned to 5 members", () => {
    expect(TONES.length).toBe(5);
    expect(new Set(TONES).size).toBe(TONES.length);
    for (const t of [
      "triumphant",
      "reassuring",
      "warning",
      "rallying",
      "somber",
    ]) {
      expect(TONES, `PropagandaTone ${t} missing`).toContain(t);
    }
  });
});
