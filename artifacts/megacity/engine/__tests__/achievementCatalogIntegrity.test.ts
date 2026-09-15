/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { ALL_BASE_ACHIEVEMENTS } from "@/engine/achievements";

/**
 * Drift guard: achievement catalog integrity.
 *
 * Background:
 * The achievement catalog (ALL_BASE_ACHIEVEMENTS) is the source of
 * truth for both in-game progress tracking AND Steam achievement
 * firing once we ship to Steam:
 *
 *   - `id`            internal key used by save state + UI.
 *   - `steamApiName`  Steam's API key. Once published to Steam, this
 *                     string is FROZEN — changing it after release
 *                     orphans every player's existing unlock and
 *                     creates a duplicate locked entry. Collisions
 *                     on this field would silently overwrite Steam
 *                     unlocks across achievements.
 *
 * This guard pins:
 *   1. No duplicate `id` (would collide in save state / unlock map).
 *   2. No duplicate `steamApiName` (would collide on Steam).
 *   3. Every achievement has a non-empty `steamApiName` (the
 *      interface declares it required, but a `""` value would slip
 *      through TypeScript and silently disable Steam firing).
 *   4. `id` and `steamApiName` follow stable conventions:
 *        id           lowercase + digits + dashes
 *        steamApiName UPPER_SNAKE_CASE prefixed `ACH_`
 *      Catches typos and accidental schema drift.
 *   5. `name` and `description` are non-empty (UI breakage guard).
 */

describe("achievement catalog integrity (drift guard)", () => {
  const cat = ALL_BASE_ACHIEVEMENTS;

  it("catalog is non-empty", () => {
    expect(cat.length).toBeGreaterThan(300);
  });

  it("ids are unique across the entire merged catalog", () => {
    const seen = new Map<string, number>();
    for (const a of cat) {
      seen.set(a.id, (seen.get(a.id) ?? 0) + 1);
    }
    const dupes = [...seen.entries()]
      .filter(([, n]) => n > 1)
      .map(([k, n]) => `${k} (×${n})`);
    if (dupes.length > 0) console.error("[ach] duplicate ids:", dupes);
    expect(dupes).toEqual([]);
  });

  it("steamApiNames are unique across the entire merged catalog", () => {
    const seen = new Map<string, number>();
    for (const a of cat) {
      seen.set(a.steamApiName, (seen.get(a.steamApiName) ?? 0) + 1);
    }
    const dupes = [...seen.entries()]
      .filter(([, n]) => n > 1)
      .map(([k, n]) => `${k} (×${n})`);
    if (dupes.length > 0) console.error("[ach] duplicate steamApiNames:", dupes);
    expect(dupes).toEqual([]);
  });

  it("every achievement has a non-empty steamApiName", () => {
    const missing = cat
      .filter((a) => !a.steamApiName || a.steamApiName.trim() === "")
      .map((a) => a.id);
    if (missing.length > 0)
      console.error("[ach] missing/empty steamApiName for ids:", missing);
    expect(missing).toEqual([]);
  });

  it("ids match the lowercase-{dash|underscore}-digit convention", () => {
    // Catalog uses BOTH dashes (original ACHIEVEMENTS array) and
    // underscores (BIOSPHERE / WORLD_ANIMALS / MEGA_PROJECT /
    // META_SOCIAL / ECOLOGY / streak / weekly sub-arrays). These
    // ids are shipped — renaming them orphans player save state
    // and Steam unlocks. Pinning the existing surface; rejects only
    // truly malformed ids (uppercase, spaces, special chars).
    const re = /^[a-z0-9][a-z0-9_-]*$/;
    const bad = cat.filter((a) => !re.test(a.id)).map((a) => a.id);
    if (bad.length > 0) console.error("[ach] non-conforming ids:", bad);
    expect(bad).toEqual([]);
  });

  it("steamApiNames match the ACH_UPPER_SNAKE convention", () => {
    const re = /^ACH_[A-Z0-9_]+$/;
    const bad = cat
      .filter((a) => !re.test(a.steamApiName))
      .map((a) => `${a.id} → ${a.steamApiName}`);
    if (bad.length > 0)
      console.error("[ach] non-conforming steamApiNames:", bad);
    expect(bad).toEqual([]);
  });

  it("title and description are non-empty for every entry", () => {
    const bad = cat
      .filter(
        (a) =>
          !a.title ||
          a.title.trim() === "" ||
          !a.description ||
          a.description.trim() === "",
      )
      .map((a) => a.id);
    if (bad.length > 0)
      console.error("[ach] missing title/description for ids:", bad);
    expect(bad).toEqual([]);
  });
});
