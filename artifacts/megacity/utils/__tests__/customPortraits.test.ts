import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  CUSTOM_PORTRAIT_PREFIX,
  MAX_CUSTOM_PORTRAIT_URI_LENGTH,
  clearCustomPortraitRegistry,
  customPortraitIdFor,
  isCustomPortraitId,
  isValidCustomPortraitUri,
  registerCustomPortrait,
  resolveCustomPortrait,
  unregisterCustomPortrait,
} from "@/utils/customPortraits";

// utils/customPortraits.ts is deliberately a pure module (no react-native or
// .webp asset imports) precisely so this suite can run under node. If an
// import sneaks in that breaks that, this whole file fails to load — which
// is the desired loud signal.

const VALID_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";

describe("custom portrait registry", () => {
  beforeEach(() => {
    clearCustomPortraitRegistry();
  });

  it("round-trips register -> resolve via the sentinel portrait id", () => {
    expect(registerCustomPortrait("prof-1", VALID_URI)).toBe(true);
    const id = customPortraitIdFor("prof-1");
    expect(id).toBe(`${CUSTOM_PORTRAIT_PREFIX}prof-1`);
    expect(isCustomPortraitId(id)).toBe(true);
    expect(resolveCustomPortrait(id)).toBe(VALID_URI);
  });

  it("returns null for unregistered, non-custom, and nullish ids", () => {
    expect(resolveCustomPortrait(customPortraitIdFor("ghost"))).toBeNull();
    expect(resolveCustomPortrait("draven_korr")).toBeNull();
    expect(resolveCustomPortrait(undefined)).toBeNull();
    expect(resolveCustomPortrait(null)).toBeNull();
  });

  it("unregister removes the entry", () => {
    registerCustomPortrait("prof-2", VALID_URI);
    unregisterCustomPortrait("prof-2");
    expect(resolveCustomPortrait(customPortraitIdFor("prof-2"))).toBeNull();
  });

  it("rejects invalid data URIs and stores nothing", () => {
    expect(registerCustomPortrait("p", "https://example.com/pic.jpg")).toBe(false);
    expect(registerCustomPortrait("p", "data:image/")).toBe(false);
    expect(registerCustomPortrait("p", 42)).toBe(false);
    expect(registerCustomPortrait("p", null)).toBe(false);
    expect(registerCustomPortrait("", VALID_URI)).toBe(false);
    expect(resolveCustomPortrait(customPortraitIdFor("p"))).toBeNull();
  });

  it("enforces the ~100 KB size cap", () => {
    const base = "data:image/jpeg;base64,";
    const atCap = base + "A".repeat(MAX_CUSTOM_PORTRAIT_URI_LENGTH - base.length);
    const overCap = atCap + "A";
    expect(isValidCustomPortraitUri(atCap)).toBe(true);
    expect(isValidCustomPortraitUri(overCap)).toBe(false);
    expect(registerCustomPortrait("big", overCap)).toBe(false);
    expect(resolveCustomPortrait(customPortraitIdFor("big"))).toBeNull();
  });

  it("isCustomPortraitId only matches the prefix", () => {
    expect(isCustomPortraitId("custom_abc")).toBe(true);
    expect(isCustomPortraitId("draven_korr")).toBe(false);
    expect(isCustomPortraitId(undefined)).toBe(false);
    expect(isCustomPortraitId(null)).toBe(false);
  });
});

// utils/portraits.ts cannot be imported under node (its .webp require()
// calls blow up), so assert its delegation to this module by source text —
// the same technique engine/__tests__/portraits.test.ts uses for its maps.
describe("getPortrait delegation (source contract)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../portraits.ts"),
    "utf8",
  );

  it("getPortrait resolves custom ids through the registry", () => {
    expect(src).toContain('from "./customPortraits"');
    expect(src).toContain("isCustomPortraitId(portraitId)");
    expect(src).toContain("resolveCustomPortrait(portraitId)");
  });

  it("falls back to the default player portrait for unresolved custom ids", () => {
    expect(src).toContain("PORTRAIT_MAP[getDefaultPlayerPortraitId()]");
  });
});

// Registry hydration is in-memory only, so EVERY path that loads profiles
// from storage must re-register uploaded portraits or they silently render
// as the stock default after an app restart. GameContext cannot be imported
// under node (native module graph), so pin the contract by source text.
describe("GameContext registry hydration (source contract)", () => {
  const ctxSrc = fs.readFileSync(
    path.resolve(__dirname, "../../context/GameContext.tsx"),
    "utf8",
  );

  it("hydrates on refreshProfiles AND the boot init path", () => {
    const hydrationLoop =
      /for \(const p of profiles\) \{\s*\n\s*if \(p\.customPortraitUri\) registerCustomPortrait\(p\.id, p\.customPortraitUri\);/g;
    const matches = ctxSrc.match(hydrationLoop) ?? [];
    // One loop in refreshProfiles, one in the boot init() path. If this
    // fails after a refactor, make sure BOTH load points still register.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("re-registers when switching to a (possibly cloud-restored) profile", () => {
    expect(ctxSrc).toContain(
      "if (profile.customPortraitUri) registerCustomPortrait(profile.id, profile.customPortraitUri);",
    );
  });

  it("unregisters on profile delete", () => {
    expect(ctxSrc).toContain("unregisterCustomPortrait(");
  });
});
