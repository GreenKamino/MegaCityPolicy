import { describe, expect, it } from "vitest";

import {
  FACTION_PRESETS,
  getPlayerFaction,
  guessKeyFromTitle,
  isPlayerFactionGlyph,
  isPlayerFactionKey,
  PLAYER_FACTION_GLYPHS,
  PLAYER_FACTION_PALETTE,
  PLAYER_FACTION_BG_PALETTE,
  presetForKey,
  setPlayerFaction,
} from "../playerFaction";
import type { GameState } from "../types";

function stubState(overrides: Partial<GameState> = {}): GameState {
  return {
    playerTitle: "City Commander",
    cityName: "MEGACITY JUAN",
    ...overrides,
  } as unknown as GameState;
}

describe("playerFaction — palette + glyph catalog", () => {
  it("ships at least 8 colors", () => {
    // Original Pack-A palette shipped 8; the customization expansion
    // raised this to 14. Pin the floor at 8 (the v2.4 contract) so
    // future trimming requires conscious test maintenance, but allow
    // additions without test churn.
    expect(PLAYER_FACTION_PALETTE.length).toBeGreaterThanOrEqual(8);
  });

  it("ships at least 10 banner glyphs", () => {
    expect(PLAYER_FACTION_GLYPHS.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique color and glyph ids", () => {
    const colorIds = new Set(PLAYER_FACTION_PALETTE.map((c) => c.id));
    expect(colorIds.size).toBe(PLAYER_FACTION_PALETTE.length);
    const glyphIds = new Set(PLAYER_FACTION_GLYPHS.map((g) => g.id));
    expect(glyphIds.size).toBe(PLAYER_FACTION_GLYPHS.length);
  });

  it("colors are valid 6-digit hex", () => {
    for (const c of PLAYER_FACTION_PALETTE) {
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("playerFaction — background palette", () => {
  it("ships valid, unique background colors", () => {
    expect(PLAYER_FACTION_BG_PALETTE.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(PLAYER_FACTION_BG_PALETTE.map((c) => c.id));
    expect(ids.size).toBe(PLAYER_FACTION_BG_PALETTE.length);
    for (const c of PLAYER_FACTION_BG_PALETTE) {
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("includes every faction preset secondary so preset picks appear selected", () => {
    const hexes = new Set(PLAYER_FACTION_BG_PALETTE.map((c) => c.hex));
    for (const preset of Object.values(FACTION_PRESETS)) {
      expect(hexes.has(preset.secondaryColor)).toBe(true);
    }
  });

  it("every background hex round-trips through setPlayerFaction validation", () => {
    for (const c of PLAYER_FACTION_BG_PALETTE) {
      const next = setPlayerFaction(stubState(), { secondaryColor: c.hex });
      expect(getPlayerFaction(next).secondaryColor).toBe(c.hex);
    }
  });
});

describe("playerFaction — type guards", () => {
  it("isPlayerFactionKey accepts all 5 keys", () => {
    expect(isPlayerFactionKey("law_enforcement")).toBe(true);
    expect(isPlayerFactionKey("military")).toBe(true);
    expect(isPlayerFactionKey("corporate")).toBe(true);
    expect(isPlayerFactionKey("intelligence")).toBe(true);
    expect(isPlayerFactionKey("underground")).toBe(true);
  });

  it("isPlayerFactionKey rejects nonsense", () => {
    expect(isPlayerFactionKey("clergy")).toBe(false);
    expect(isPlayerFactionKey(null)).toBe(false);
    expect(isPlayerFactionKey(42)).toBe(false);
  });

  it("isPlayerFactionGlyph rejects unknown glyphs", () => {
    expect(isPlayerFactionGlyph("megacity")).toBe(true);
    expect(isPlayerFactionGlyph("not-a-glyph")).toBe(false);
  });
});

describe("playerFaction — presetForKey", () => {
  it("returns the matching preset", () => {
    expect(presetForKey("military").key).toBe("military");
    expect(presetForKey("corporate").name).toBe(FACTION_PRESETS.corporate.name);
  });

  it("falls back to law_enforcement for unknown keys", () => {
    expect(presetForKey("clergy").key).toBe("law_enforcement");
  });

  it("returns a fresh copy each call (mutation safe)", () => {
    const a = presetForKey("military");
    a.name = "MUTATED";
    const b = presetForKey("military");
    expect(b.name).toBe(FACTION_PRESETS.military.name);
  });
});

describe("playerFaction — getPlayerFaction defaults", () => {
  it("returns a derived preset when state has no playerFaction", () => {
    const id = getPlayerFaction(stubState({ playerTitle: "Justice Commander" }));
    expect(id.key).toBe("law_enforcement");
    expect(id.name.length).toBeGreaterThan(0);
    expect(id.motto.length).toBeGreaterThan(0);
  });

  it("uses guessed key from a military-flavored title", () => {
    const id = getPlayerFaction(stubState({ playerTitle: "War Commander" }));
    expect(id.key).toBe("military");
  });

  it("returns the stored identity when present and valid", () => {
    const stored = {
      key: "corporate" as const,
      name: "OMNI HOLDINGS",
      motto: "All paths lead to the boardroom.",
      primaryColor: "#FF9500",
      secondaryColor: "#5C3A0F",
      glyph: "corps" as const,
    };
    const id = getPlayerFaction(stubState({ playerFaction: stored }));
    expect(id).toEqual(stored);
  });

  it("repairs a bad color with the preset value", () => {
    const id = getPlayerFaction(
      stubState({
        playerFaction: {
          key: "military",
          name: "WAR COMMAND",
          motto: "By Steel.",
          primaryColor: "not-a-color" as any,
          secondaryColor: "#5C0F0F",
          glyph: "megacity",
        },
      }),
    );
    expect(id.primaryColor).toBe(FACTION_PRESETS.military.primaryColor);
  });

  it("repairs an unknown glyph with the preset value", () => {
    const id = getPlayerFaction(
      stubState({
        playerFaction: {
          key: "military",
          name: "X",
          motto: "Y",
          primaryColor: "#FF3B30",
          secondaryColor: "#5C0F0F",
          glyph: "not-a-glyph" as any,
        },
      }),
    );
    expect(id.glyph).toBe(FACTION_PRESETS.military.glyph);
  });

  it("falls back when name/motto are blank", () => {
    const id = getPlayerFaction(
      stubState({
        playerFaction: {
          key: "military",
          name: "   ",
          motto: "",
          primaryColor: "#FF3B30",
          secondaryColor: "#5C0F0F",
          glyph: "megacity",
        },
      }),
    );
    expect(id.name).toBe(FACTION_PRESETS.military.name);
    expect(id.motto).toBe(FACTION_PRESETS.military.motto);
  });
});

describe("playerFaction — setPlayerFaction merge", () => {
  it("seeds an identity on first save when none exists", () => {
    const next = setPlayerFaction(stubState({ playerTitle: "Director" }), {
      name: "OMNICORP",
    });
    expect(next.playerFaction?.name).toBe("OMNICORP");
    expect(next.playerFaction?.key).toBe("corporate");
  });

  it("preserves untouched fields on a partial patch", () => {
    const seeded = setPlayerFaction(stubState(), { key: "military", name: "WAR LINE" });
    const next = setPlayerFaction(seeded, { motto: "No Quarter." });
    expect(next.playerFaction?.name).toBe("WAR LINE");
    expect(next.playerFaction?.motto).toBe("No Quarter.");
    expect(next.playerFaction?.key).toBe("military");
  });

  it("trims whitespace on text fields", () => {
    const next = setPlayerFaction(stubState(), { name: "  TRIMMED  " });
    expect(next.playerFaction?.name).toBe("TRIMMED");
  });

  it("ignores invalid colors silently", () => {
    const seeded = setPlayerFaction(stubState(), { primaryColor: "#FF0000" });
    const next = setPlayerFaction(seeded, { primaryColor: "garbage" as any });
    expect(next.playerFaction?.primaryColor).toBe("#FF0000");
  });

  it("ignores blank text patches (keeps prior value)", () => {
    const seeded = setPlayerFaction(stubState(), { name: "REAL NAME" });
    const next = setPlayerFaction(seeded, { name: "   " });
    expect(next.playerFaction?.name).toBe("REAL NAME");
  });

  it("never mutates the input state", () => {
    const before = stubState();
    const after = setPlayerFaction(before, { name: "PARTY" });
    expect(before.playerFaction).toBeUndefined();
    expect(after).not.toBe(before);
  });
});

describe("playerFaction — guessKeyFromTitle", () => {
  it("falls back to law_enforcement on empty/unknown titles", () => {
    expect(guessKeyFromTitle(undefined)).toBe("law_enforcement");
    expect(guessKeyFromTitle("Floor Manager")).toBe("law_enforcement");
  });

  it("matches each faction by representative title text", () => {
    expect(guessKeyFromTitle("Justice Commander")).toBe("law_enforcement");
    expect(guessKeyFromTitle("War Commander")).toBe("military");
    expect(guessKeyFromTitle("Director-General")).toBe("corporate");
    expect(guessKeyFromTitle("Shadow Chief")).toBe("intelligence");
    expect(guessKeyFromTitle("People's Voice")).toBe("underground");
  });
});
