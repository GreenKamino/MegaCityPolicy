import { describe, expect, it } from "vitest";
import { buildKeyboardSections, type KeyboardSection } from "@/components/keyboardHelpSections";

// The keyboard-help overlay is one of the surfaces that assumed the real-time
// clock. In turn-based mode Space / controller X / Start drive End Turn and the
// speed controls are meaningless — this locks that in so the overlay can never
// silently tell a turn-based player to press Pause or change game speed.

function findAction(sections: KeyboardSection[], title: string, key: string): string | undefined {
  return sections.find((s) => s.title === title)?.keys.find((k) => k.key === key)?.action;
}

describe("buildKeyboardSections — mode-aware controls", () => {
  it("real-time mode keeps Pause / Resume and the speed controls", () => {
    const s = buildKeyboardSections(false);
    expect(findAction(s, "GAME CONTROLS", "Space")).toBe("Pause / Resume");
    expect(findAction(s, "GAME CONTROLS", "+  /  =")).toBe("Increase Game Speed");
    expect(findAction(s, "GAME CONTROLS", "−")).toBe("Decrease Game Speed");
    expect(findAction(s, "CONTROLLER / STEAM DECK", "X")).toBe("Pause / Resume");
    expect(findAction(s, "CONTROLLER / STEAM DECK", "Start")).toBe("Pause / Resume");
  });

  it("turn-based mode maps Space / X / Start to End Turn", () => {
    const s = buildKeyboardSections(true);
    expect(findAction(s, "GAME CONTROLS", "Space")).toBe("End Turn");
    expect(findAction(s, "CONTROLLER / STEAM DECK", "X")).toBe("End Turn");
    expect(findAction(s, "CONTROLLER / STEAM DECK", "Start")).toBe("End Turn");
  });

  it("turn-based mode hides the real-time speed controls", () => {
    const keys = buildKeyboardSections(true)
      .find((sec) => sec.title === "GAME CONTROLS")!
      .keys.map((k) => k.key);
    expect(keys).not.toContain("+  /  =");
    expect(keys).not.toContain("−");
  });

  it("turn-based mode never tells the player to pause or change game speed", () => {
    const actions = buildKeyboardSections(true)
      .flatMap((sec) => sec.keys.map((k) => k.action.toLowerCase()));
    for (const action of actions) {
      expect(action).not.toContain("pause");
      expect(action).not.toContain("game speed");
    }
  });

  it("both modes expose the same section titles in the same order", () => {
    const rt = buildKeyboardSections(false).map((s) => s.title);
    const tb = buildKeyboardSections(true).map((s) => s.title);
    expect(tb).toEqual(rt);
  });
});
