/**
 * Task #561 — Officer action buttons: press and success feedback.
 *
 * Officer sandbox actions (INVESTIGATE and the rest of the MORE ACTIONS
 * menu) used to execute silently on success — a player repeatedly pressed
 * INVESTIGATE (3,000c each) with no acknowledgment and burned ~12K credits
 * before the disabled out-of-credits state hinted anything had happened.
 *
 * app/(game)/officers.tsx is an un-importable Expo screen module in node
 * vitest, so these are source pins (same readFileSync approach used by
 * overviewIncidentsCollapse and the breakdown tests). They keep the
 * feedback contract from silently regressing:
 *   1. action buttons show a pressed state while held,
 *   2. pressing plays a haptic tick (web-safe — playHaptic no-ops on web),
 *   3. a successful action surfaces a success toast built from the
 *      per-action metadata (label + effects + cost), not hand-written text,
 *   4. a short post-success debounce blocks accidental double-fires,
 *   5. the existing failure modal path stays wired.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const screenSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

const officersSource = screenSource("../../app/(game)/officers.tsx");

describe("officer action press + success feedback (Task #561)", () => {
  it("action buttons render a pressed state while held", () => {
    // Pressable style must be the function form reading `pressed`, and the
    // pressed style must not apply to blocked buttons.
    expect(officersSource).toContain("style={({ pressed }) => [");
    expect(officersSource).toContain("pressed && !blocked && mStyles.actionBtnPressed");
    expect(officersSource).toMatch(/actionBtnPressed:\s*\{/);
  });

  it("pressing an action plays a haptic tick via the shared haptics module", () => {
    expect(officersSource).toContain('import { playHaptic } from "@/engine/haptics";');
    expect(officersSource).toContain('playHaptic("light");');
  });

  it("a successful action surfaces a success toast built from action metadata", () => {
    // Toast text comes from OFFICER_ACTION_META label + the shared effects
    // formatter + OFFICER_ACTION_RULES cost — no hand-written strings.
    expect(officersSource).toContain(
      "showToast(`${meta.label}: ${officer.name} — ${effects}${cost}`, \"success\");",
    );
    expect(officersSource).toContain("const effects = formatOfficerActionEffects(action);");
    expect(officersSource).toContain(
      "const cost = rule.cost > 0 ? ` · ${rule.cost.toLocaleString()}c spent` : \"\";",
    );
  });

  it("a short post-success debounce blocks accidental double-fires", () => {
    // Guard at the top of the press handler, cooldown armed only on success,
    // buttons disabled while it runs, and the timer is cleaned up on unmount.
    expect(officersSource).toContain("if (actionCooldown) return;");
    expect(officersSource).toMatch(
      /if \(ok\) \{\s*\n\s*setActionCooldown\(true\);\s*\n\s*cooldownTimer\.current = setTimeout\(\(\) => setActionCooldown\(false\), \d+\);/,
    );
    expect(officersSource).toContain("disabled={Boolean(blocked) || actionCooldown}");
    expect(officersSource).toContain("if (cooldownTimer.current) clearTimeout(cooldownTimer.current);");
  });

  it("the failure modal path stays wired and only fires on failure", () => {
    expect(officersSource).toContain("if (result.reason) setActionFeedback(result.reason);");
    expect(officersSource).toContain('playHaptic("error");');
    expect(officersSource).toContain('title="ACTION BLOCKED"');
  });

  it("the perform handler reports success back to the menu for the debounce", () => {
    expect(officersSource).toContain(
      "onPerform: (action: OfficerActionId) => boolean;",
    );
    expect(officersSource).toContain(
      "onPerformAction: (action: OfficerActionId) => boolean;",
    );
    expect(officersSource).toMatch(
      /const handlePerformAction = useCallback\(\(officer: Officer, action: OfficerActionId\): boolean =>/,
    );
  });
});
