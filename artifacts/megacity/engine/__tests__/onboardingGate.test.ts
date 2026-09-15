import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { TUTORIAL_HINTS } from "@/engine/tutorialHints";
import type { GameMessage, GameState } from "@/engine/types";

// Coverage for the first-run onboarding flow shipped in task #104:
//
//   1. migrateState — legacy saves silently opt out of the walkthrough
//      (hasCompletedOnboarding → true), fresh-style saves with the field
//      explicitly false stay false. Same for onboardingStep cursor.
//
//   2. TUTORIAL_HINTS catalog vs in-screen render — every catalog entry
//      must be rendered by exactly one screen, and the inline `message`
//      string must match the catalog message verbatim. Catches drift
//      when copy is edited in one place but not the other.
//
//   3. markMessageRead transformation — the welcome-dispatch read flag
//      flip is idempotent: applying twice equals applying once. The
//      onboarding "dispatch" beat watches for this transition and would
//      false-fire on a non-idempotent reducer.
//
// The catalog/render check reads the .tsx screen files from disk because
// pulling React components into vitest would require a full RN web env.
// Reading source text gives us a deterministic, fast, env-free check.

// ---------------------------------------------------------------------------
// 1. migrateState onboarding fields
// ---------------------------------------------------------------------------

describe("migrateState onboarding fields", () => {
  it("treats undefined hasCompletedOnboarding as true (veteran skip)", () => {
    const fresh = createInitialState() as GameState;
    // Strip the field so the legacy save shape (predating the flag) is
    // preserved on disk. Use a typed unknown-record so we don't reach for
    // `any`: the migrate path is documented to accept partial shapes.
    const legacy = { ...fresh } as Partial<GameState> & Record<string, unknown>;
    delete legacy.hasCompletedOnboarding;
    delete legacy.onboardingStep;
    delete legacy.didBuild;
    delete legacy.didEdict;
    delete legacy.didRead;

    const out = migrateState(legacy as GameState);
    expect(out.hasCompletedOnboarding).toBe(true);
    expect(out.onboardingStep).toBe(null);
    // Veteran backfill: per-beat flags default to true so any defensive
    // resume code reads them as already-completed.
    expect(out.didBuild).toBe(true);
    expect(out.didEdict).toBe(true);
    expect(out.didRead).toBe(true);
  });

  it("preserves explicit hasCompletedOnboarding=false on a fresh save", () => {
    const fresh = createInitialState() as GameState;
    expect(fresh.hasCompletedOnboarding).toBe(false);
    expect(fresh.didBuild).toBe(false);
    expect(fresh.didEdict).toBe(false);
    expect(fresh.didRead).toBe(false);

    const out = migrateState(fresh);
    expect(out.hasCompletedOnboarding).toBe(false);
    expect(out.onboardingStep).toBe(null);
    expect(out.didBuild).toBe(false);
    expect(out.didEdict).toBe(false);
    expect(out.didRead).toBe(false);
  });

  it("preserves a mid-walkthrough onboardingStep cursor", () => {
    const fresh = createInitialState() as GameState;
    const midFlow: GameState = { ...fresh, onboardingStep: "edict" };
    const out = migrateState(midFlow);
    expect(out.hasCompletedOnboarding).toBe(false);
    expect(out.onboardingStep).toBe("edict");
  });

  it("preserves a mid-flow per-beat completion flag across migrate", () => {
    // Player authorised the worker housing stack but saved+quit before
    // the OnboardingBanner could advance. The flag is what carries the
    // in-flight progress forward — onboardingStep alone would still read
    // as "build" and re-strand them on the same beat.
    const fresh = createInitialState() as GameState;
    const inFlight: GameState = {
      ...fresh,
      onboardingStep: "build",
      didBuild: true,
    };
    const out = migrateState(inFlight);
    expect(out.hasCompletedOnboarding).toBe(false);
    expect(out.onboardingStep).toBe("build");
    expect(out.didBuild).toBe(true);
    expect(out.didEdict).toBe(false);
    expect(out.didRead).toBe(false);
  });

  it("preserves hasCompletedOnboarding=true for a player who finished", () => {
    const fresh = createInitialState() as GameState;
    const done: GameState = {
      ...fresh,
      hasCompletedOnboarding: true,
      onboardingStep: null,
      didBuild: true,
      didEdict: true,
      didRead: true,
    };
    const out = migrateState(done);
    expect(out.hasCompletedOnboarding).toBe(true);
    expect(out.onboardingStep).toBe(null);
    expect(out.didBuild).toBe(true);
    expect(out.didEdict).toBe(true);
    expect(out.didRead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Tutorial hint catalog vs in-screen render
// ---------------------------------------------------------------------------

// Pull every <TutorialHint id="..." message="..." /> render out of the
// screen sources. The catalog convention (and every shipped screen) writes
// `id` before `message`; we enforce that ordering so the regex is simple
// and unambiguous. Whitespace (including newlines) between attributes is
// tolerated. The message itself must be a single double-quoted string
// literal — the actual usage in every screen.
const TUTORIAL_HINT_RX =
  /<TutorialHint\b[^>]*?\bid\s*=\s*"([^"]+)"[^>]*?\bmessage\s*=\s*"((?:[^"\\]|\\.)*)"[\s\S]*?\/>/g;

const SCREEN_DIR = path.resolve(__dirname, "../../app/(game)");

function collectScreenRenders(): Array<{ id: string; message: string; file: string }> {
  const files = readdirSync(SCREEN_DIR).filter((f) => f.endsWith(".tsx"));
  const renders: Array<{ id: string; message: string; file: string }> = [];
  for (const file of files) {
    const src = readFileSync(path.join(SCREEN_DIR, file), "utf8");
    if (!src.includes("<TutorialHint")) continue;
    let m: RegExpExecArray | null;
    TUTORIAL_HINT_RX.lastIndex = 0;
    while ((m = TUTORIAL_HINT_RX.exec(src))) {
      // Decode the JSX string literal — only \" and \\ are realistic here;
      // none of our shipped messages embed escape sequences.
      const raw = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      renders.push({ id: m[1], message: raw, file });
    }
  }
  return renders;
}

describe("TUTORIAL_HINTS catalog vs in-screen render", () => {
  const renders = collectScreenRenders();
  const catalogIds = new Set(TUTORIAL_HINTS.map((h) => h.id));
  const renderIds = renders.map((r) => r.id);

  it("renders at least one TutorialHint per catalog entry (sanity)", () => {
    // If the regex broke or every screen lost its TutorialHint, this is
    // the cheapest signal.
    expect(renders.length).toBeGreaterThanOrEqual(TUTORIAL_HINTS.length);
  });

  it("renders every catalog id in exactly one screen", () => {
    const counts = new Map<string, string[]>();
    for (const r of renders) {
      const list = counts.get(r.id) ?? [];
      list.push(r.file);
      counts.set(r.id, list);
    }
    for (const entry of TUTORIAL_HINTS) {
      const sites = counts.get(entry.id) ?? [];
      expect(
        sites.length,
        `Catalog id "${entry.id}" should be rendered exactly once. Found in: ${sites.join(", ") || "(no screen)"}`
      ).toBe(1);
    }
  });

  it("does not render any id missing from the catalog", () => {
    for (const r of renders) {
      expect(
        catalogIds.has(r.id),
        `Screen ${r.file} renders <TutorialHint id="${r.id}" /> but the id is not in TUTORIAL_HINTS`
      ).toBe(true);
    }
  });

  it("matches the inline message verbatim against the catalog message", () => {
    const byId = new Map(TUTORIAL_HINTS.map((h) => [h.id, h.message]));
    for (const r of renders) {
      const expected = byId.get(r.id);
      if (expected === undefined) continue; // covered by the previous test
      expect(
        r.message,
        `Inline message for "${r.id}" in ${r.file} drifted from TUTORIAL_HINTS catalog`
      ).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. markMessageRead idempotence on the welcome dispatch
// ---------------------------------------------------------------------------

// markMessageRead is implemented as a useCallback inside GameContext that
// pumps state through the same pure transformation regardless of how often
// it fires. We replicate the transformation here because pulling the React
// context into vitest requires a host renderer; the contract under test is
// the *transformation*, not the React wiring.
function applyMarkMessageRead(messages: GameMessage[], id: string): GameMessage[] {
  return (messages ?? []).map((m) => (m.id === id ? { ...m, read: true } : m));
}

describe("markMessageRead idempotence", () => {
  it("flips msg-welcome.read to true on first apply", () => {
    const fresh = createInitialState() as GameState;
    const welcome = fresh.messages.find((m) => m.id === "msg-welcome");
    expect(welcome, "fresh state should ship a msg-welcome dispatch").toBeDefined();
    expect(welcome?.read).toBe(false);

    const after = applyMarkMessageRead(fresh.messages, "msg-welcome");
    expect(after.find((m) => m.id === "msg-welcome")?.read).toBe(true);
  });

  it("is idempotent — applying twice equals applying once", () => {
    const fresh = createInitialState() as GameState;
    const once = applyMarkMessageRead(fresh.messages, "msg-welcome");
    const twice = applyMarkMessageRead(once, "msg-welcome");
    expect(twice.length).toBe(once.length);
    for (let i = 0; i < twice.length; i++) {
      expect(twice[i].id).toBe(once[i].id);
      expect(twice[i].read).toBe(once[i].read);
    }
  });

  it("is a no-op when the id is not present", () => {
    const fresh = createInitialState() as GameState;
    const out = applyMarkMessageRead(fresh.messages, "msg-does-not-exist");
    expect(out.length).toBe(fresh.messages.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].read).toBe(fresh.messages[i].read);
    }
  });
});
