/**
 * Save-roundtrip integration test for the Pack A (faction identity)
 * and Pack B (wardrobe) cosmetic surfaces.
 *
 * The migrateState path uses `...saved` to preserve unknown / new
 * fields, so playerFaction / playerOutfit / officerOutfits are not
 * explicitly migrated — but they MUST survive a JSON round-trip and
 * the migration pass without loss. Equally important, legacy saves
 * (where these fields don't exist at all) must not crash and must
 * render through the helpers' fallbacks.
 *
 * This file specifically asserts:
 *   1. Modern save with all three cosmetic fields → fields preserved
 *      verbatim through JSON.stringify → JSON.parse → migrateState.
 *   2. Legacy save with NONE of the three fields → getters return
 *      coherent defaults derived from playerTitle / preset / DEFAULT_OUTFIT.
 *   3. Malformed cosmetic data (oversized strings, garbage glyph, bad
 *      hex) is sanitized to safe values rather than crashing or being
 *      stored verbatim.
 */
import { describe, expect, it } from "vitest";

import { createInitialState } from "../initialState";
import { getPlayerFaction, setPlayerFaction, PLAYER_FACTION_NAME_MAX, PLAYER_FACTION_MOTTO_MAX } from "../playerFaction";
import { getOfficerOutfit, getPlayerOutfit, setOfficerOutfit, setPlayerOutfit } from "../wardrobe";
import { migrateState } from "../saveLoad";

describe("cosmetic packs — save persistence + legacy migration", () => {
  it("preserves playerFaction, playerOutfit, officerOutfits across a JSON round-trip + migrate", () => {
    let state = createInitialState();
    // Pick a real officer id from the seeded roster so setOfficerOutfit
    // has something concrete to land against.
    const officerId = state.officers[0]?.id ?? "test-officer-1";

    // Stamp custom cosmetic data on every surface.
    state = setPlayerFaction(state, {
      key: "corporate",
      name: "OmniCorp Internal Affairs",
      motto: "Profit is order.",
      primaryColor: "#FFA500",
      secondaryColor: "#3D2A0F",
      glyph: "corps",
    });
    state = setPlayerOutfit(state, { uniformId: "dress", sidearmId: "monoblade" });
    state = setOfficerOutfit(state, officerId, { uniformId: "stealth", sidearmId: "smartgun" });

    // Round-trip through the same pipeline a real save uses.
    const serialized = JSON.stringify(state);
    const parsed = JSON.parse(serialized);
    const migrated = migrateState(parsed);

    // Pack A — faction identity preserved verbatim.
    const fact = getPlayerFaction(migrated);
    expect(fact.key).toBe("corporate");
    expect(fact.name).toBe("OmniCorp Internal Affairs");
    expect(fact.motto).toBe("Profit is order.");
    expect(fact.primaryColor).toBe("#FFA500");
    expect(fact.secondaryColor).toBe("#3D2A0F");
    expect(fact.glyph).toBe("corps");

    // Pack B — player outfit preserved.
    const playerOutfit = getPlayerOutfit(migrated);
    expect(playerOutfit.uniformId).toBe("dress");
    expect(playerOutfit.sidearmId).toBe("monoblade");

    // Pack B — per-officer outfit preserved.
    const officerOutfit = getOfficerOutfit(migrated, officerId);
    expect(officerOutfit.uniformId).toBe("stealth");
    expect(officerOutfit.sidearmId).toBe("smartgun");
  });

  it("renders coherent defaults for a legacy save with NONE of the cosmetic fields", () => {
    // Simulate a legacy save by stripping the three new fields
    // entirely — exactly the shape an older save file would have.
    const fresh = createInitialState();
    const legacy = JSON.parse(JSON.stringify(fresh));
    delete legacy.playerFaction;
    delete legacy.playerOutfit;
    delete legacy.officerOutfits;

    const migrated = migrateState(legacy);

    // Faction getter must return a complete, coherent record derived
    // from the player title via the heuristic. The default seed title
    // is "City Commander", which routes to military via guessKeyFromTitle
    // — but the precise key matters less than the contract: every
    // field is populated and well-formed so the HUD never renders
    // empty / undefined values.
    const fact = getPlayerFaction(migrated);
    expect(["law_enforcement", "military", "corporate", "intelligence", "underground"]).toContain(fact.key);
    expect(fact.name.length).toBeGreaterThan(0);
    expect(fact.motto.length).toBeGreaterThan(0);
    expect(fact.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(fact.secondaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(fact.glyph).toBeTruthy();

    // Player outfit must fall back to DEFAULT_OUTFIT.
    const playerOutfit = getPlayerOutfit(migrated);
    expect(playerOutfit.uniformId).toBe("field");
    expect(playerOutfit.sidearmId).toBe("service-pistol");

    // Officer outfit must fall back without throwing for any officer id.
    const officerId = migrated.officers[0]?.id ?? "missing";
    const officerOutfit = getOfficerOutfit(migrated, officerId);
    expect(officerOutfit.uniformId).toBe("field");
    expect(officerOutfit.sidearmId).toBe("service-pistol");
  });

  it("sanitizes malformed cosmetic data on read so a tampered save can't break the UI", () => {
    const fresh = createInitialState();
    // Hand-craft an "evil" save with oversized text, bad hex, and an
    // unknown glyph. None of these should crash the getter or land
    // verbatim in the rendered output.
    const evil = JSON.parse(JSON.stringify(fresh));
    evil.playerFaction = {
      key: "corporate",
      name: "X".repeat(500), // way over PLAYER_FACTION_NAME_MAX
      motto: "Y".repeat(2000), // way over PLAYER_FACTION_MOTTO_MAX
      primaryColor: "not-a-color",
      secondaryColor: "#ZZZZZZ",
      glyph: "definitely-not-a-real-glyph",
    };
    evil.playerOutfit = { uniformId: "no-such-uniform", sidearmId: "no-such-sidearm" };
    evil.officerOutfits = { "ghost-officer": { uniformId: 42, sidearmId: null } };

    const migrated = migrateState(evil);

    const fact = getPlayerFaction(migrated);
    expect(fact.name.length).toBeLessThanOrEqual(PLAYER_FACTION_NAME_MAX);
    expect(fact.motto.length).toBeLessThanOrEqual(PLAYER_FACTION_MOTTO_MAX);
    expect(fact.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(fact.secondaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    // Unknown glyph must be replaced with the preset's glyph for the key.
    expect(fact.glyph).not.toBe("definitely-not-a-real-glyph");

    // Outfit getters must coerce unknown ids to safe defaults.
    const playerOutfit = getPlayerOutfit(migrated);
    expect(playerOutfit.uniformId).toBe("field");
    expect(playerOutfit.sidearmId).toBe("service-pistol");

    const officerOutfit = getOfficerOutfit(migrated, "ghost-officer");
    expect(officerOutfit.uniformId).toBe("field");
    expect(officerOutfit.sidearmId).toBe("service-pistol");
  });
});
