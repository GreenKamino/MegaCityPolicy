import { describe, it, expect } from "vitest";
import {
  type AutoPauseState,
  buildDocumentTitle,
  handleHidden,
  handleVisible,
  screenLabel,
  speedLabel,
} from "../useDesktopPolish.helpers";

const freshState = (tickPaused = false): AutoPauseState => ({
  ownsPause: false,
  tickPaused,
});

describe("useDesktopPolish helpers", () => {
  describe("speedLabel", () => {
    it("returns PAUSED when paused regardless of interval", () => {
      expect(speedLabel(1, true)).toBe("PAUSED");
      expect(speedLabel(60, true)).toBe("PAUSED");
    });

    it("maps tick intervals to readable speed labels", () => {
      expect(speedLabel(1, false)).toBe("1M/TICK");
      expect(speedLabel(5, false)).toBe("5M/TICK");
      expect(speedLabel(10, false)).toBe("10M/TICK");
      expect(speedLabel(15, false)).toBe("15M/TICK");
      expect(speedLabel(60, false)).toBe("1H/TICK");
    });

    it("returns empty string for unknown intervals", () => {
      expect(speedLabel(7, false)).toBe("");
      expect(speedLabel(0, false)).toBe("");
    });
  });

  describe("screenLabel", () => {
    it("returns the human label for known top-nav routes", () => {
      expect(screenLabel("/(game)/overview")).toBe("CITY");
      expect(screenLabel("/(game)/law")).toBe("LAW");
      expect(screenLabel("/(game)/economy")).toBe("ECONOMY");
      expect(screenLabel("/(game)/worldmap")).toBe("MAP");
      expect(screenLabel("/(game)/construction")).toBe("BUILD");
      expect(screenLabel("/(game)/diplomacy")).toBe("DIPLO");
      expect(screenLabel("/(game)/more")).toBe("MORE");
    });

    it("returns the human label for known bottom-bar routes", () => {
      expect(screenLabel("/(game)/inbox")).toBe("INBOX");
      expect(screenLabel("/(game)/research")).toBe("RESEARCH");
      expect(screenLabel("/(game)/military")).toBe("MILITARY");
      expect(screenLabel("/(game)/factions")).toBe("FACTIONS");
      expect(screenLabel("/(game)/events")).toBe("EVENTS");
      expect(screenLabel("/(game)/wildlands")).toBe("WILDLANDS");
      expect(screenLabel("/(game)/character")).toBe("DOSSIER");
    });

    it("falls back to upper-cased segment for unknown routes", () => {
      expect(screenLabel("/(game)/finances")).toBe("FINANCES");
      expect(screenLabel("/(game)/codex")).toBe("CODEX");
    });

    it("handles router-stripped paths without the (game) group", () => {
      expect(screenLabel("/military")).toBe("MILITARY");
      expect(screenLabel("/overview")).toBe("CITY");
    });

    it("returns empty string for empty pathname", () => {
      expect(screenLabel("")).toBe("");
      expect(screenLabel("/")).toBe("");
    });
  });

  describe("buildDocumentTitle", () => {
    it("includes city, screen, and speed when running", () => {
      expect(buildDocumentTitle("MEGACITY ALPHA", "/(game)/military", 5, false))
        .toBe("MEGACITY · MEGACITY ALPHA · MILITARY · 5M/TICK");
    });

    it("prepends the pause indicator and PAUSED label when paused", () => {
      expect(buildDocumentTitle("JUAN", "/(game)/overview", 5, true))
        .toBe("▮▮ MEGACITY · JUAN · CITY · PAUSED");
    });

    it("omits city/screen/speed parts when blank or unknown", () => {
      expect(buildDocumentTitle("", "/", 5, false)).toBe("MEGACITY · 5M/TICK");
      expect(buildDocumentTitle("", "", 7, false)).toBe("MEGACITY");
    });
  });

  describe("auto-pause state machine (handleHidden / handleVisible)", () => {
    it("hides: first hidden event auto-pauses and claims ownership", () => {
      const s = freshState(false);
      expect(handleHidden(s)).toBe(true);
      expect(s.ownsPause).toBe(true);
    });

    it("hides: duplicate hidden event (blur + visibilitychange) is a no-op", () => {
      // Reproduces the original bug: blur fires, then visibilitychange fires
      // before React has flushed the tickPaused state update. The second call
      // must NOT re-toggle and unpause the game.
      const s = freshState(false);
      expect(handleHidden(s)).toBe(true);
      // Simulate React not having flushed yet — tickPaused still mirrors false.
      expect(handleHidden(s)).toBe(false);
      expect(s.ownsPause).toBe(true);
    });

    it("hides: respects an already-paused game (user paused manually)", () => {
      const s = freshState(true);
      expect(handleHidden(s)).toBe(false);
      expect(s.ownsPause).toBe(false);
    });

    it("visible: resumes when we own the pause and game is still paused", () => {
      const s: AutoPauseState = { ownsPause: true, tickPaused: true };
      expect(handleVisible(s)).toBe(true);
      expect(s.ownsPause).toBe(false);
    });

    it("visible: duplicate visible event (focus + visibilitychange) is a no-op", () => {
      const s: AutoPauseState = { ownsPause: true, tickPaused: true };
      expect(handleVisible(s)).toBe(true);
      // Second call: ownership already released, must not toggle again.
      expect(handleVisible(s)).toBe(false);
    });

    it("visible: never touches game we did not pause", () => {
      const s: AutoPauseState = { ownsPause: false, tickPaused: true };
      expect(handleVisible(s)).toBe(false);
    });

    it("visible: releases ownership without toggling if user manually un-paused", () => {
      const s: AutoPauseState = { ownsPause: true, tickPaused: false };
      expect(handleVisible(s)).toBe(false);
      expect(s.ownsPause).toBe(false);
    });

    it("full cycle: hide -> show toggles exactly twice across many spurious events", () => {
      const s = freshState(false);
      let toggles = 0;
      const hide = () => { if (handleHidden(s)) { toggles++; s.tickPaused = !s.tickPaused; } };
      const show = () => { if (handleVisible(s)) { toggles++; s.tickPaused = !s.tickPaused; } };
      // Browser fires blur + visibilitychange(hidden) on hide
      hide(); hide();
      // ...and focus + visibilitychange(visible) on show
      show(); show();
      expect(toggles).toBe(2);
      expect(s.tickPaused).toBe(false);
      expect(s.ownsPause).toBe(false);
    });
  });
});
