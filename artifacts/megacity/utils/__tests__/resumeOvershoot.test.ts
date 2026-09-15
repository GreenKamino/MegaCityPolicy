import { describe, expect, it } from "vitest";

import {
  getOvershootEscalation,
  isResumeOvershoot,
  OVERSHOOT_ABS_MS,
  OVERSHOOT_RATIO,
  RESUME_OVERSHOOT_HISTORY_CAP,
} from "@/utils/format";

describe("isResumeOvershoot — both ratio and absolute gates must trip", () => {
  it("returns true when actual blows past estimate by both ratio and absolute gap", () => {
    expect(isResumeOvershoot(3200, 1000)).toBe(true);
  });

  it("returns false when ratio threshold is not met (jitter within budget)", () => {
    expect(isResumeOvershoot(1200, 1000)).toBe(false);
  });

  it("returns false when ratio is high but absolute gap is tiny (sub-second resume)", () => {
    // 6ms vs 2ms is 3× but the 4ms gap stays well under OVERSHOOT_ABS_MS.
    expect(isResumeOvershoot(6, 2)).toBe(false);
  });

  it("returns false when either input is missing or non-positive", () => {
    expect(isResumeOvershoot(undefined, 1000)).toBe(false);
    expect(isResumeOvershoot(3000, undefined)).toBe(false);
    expect(isResumeOvershoot(0, 1000)).toBe(false);
    expect(isResumeOvershoot(3000, 0)).toBe(false);
    expect(isResumeOvershoot(-100, 1000)).toBe(false);
  });

  it("trips exactly at the binding-constraint boundary", () => {
    // With est=1000, the ratio gate requires actual >= 1500 and the
    // abs gate requires actual >= 1400. Ratio is the binding constraint
    // here, so 1500 should trip and 1499 should not.
    const est = 1000;
    const minActual = Math.max(est * OVERSHOOT_RATIO, est + OVERSHOOT_ABS_MS);
    expect(isResumeOvershoot(minActual, est)).toBe(true);
    expect(isResumeOvershoot(minActual - 1, est)).toBe(false);
  });

  it("trips at the abs-gate boundary when ratio is comfortably exceeded", () => {
    // With est=10, the ratio gate is satisfied by anything >=15, but
    // the abs gate dominates and requires actual >= 10 + 400 = 410.
    const est = 10;
    expect(isResumeOvershoot(409, est)).toBe(false);
    expect(isResumeOvershoot(410, est)).toBe(true);
  });
});

describe("getOvershootEscalation — count → tier mapping", () => {
  it("maps zero or negative counts to 'none'", () => {
    expect(getOvershootEscalation(0)).toBe("none");
    expect(getOvershootEscalation(-3)).toBe("none");
  });

  it("maps a single overshoot to 'soft'", () => {
    expect(getOvershootEscalation(1)).toBe("soft");
  });

  it("maps 2-3 overshoots to 'moderate'", () => {
    expect(getOvershootEscalation(2)).toBe("moderate");
    expect(getOvershootEscalation(3)).toBe("moderate");
  });

  it("maps 4+ overshoots to 'severe'", () => {
    expect(getOvershootEscalation(4)).toBe("severe");
    expect(getOvershootEscalation(RESUME_OVERSHOOT_HISTORY_CAP)).toBe("severe");
    expect(getOvershootEscalation(99)).toBe("severe");
  });

  it("guards NaN/Infinity safely", () => {
    // Number.isFinite rejects both — neither should escalate. Treating
    // Infinity as 'severe' could mask a counter-overflow bug, so we
    // explicitly fall back to 'none' for any non-finite input.
    expect(getOvershootEscalation(NaN)).toBe("none");
    expect(getOvershootEscalation(Infinity)).toBe("none");
    expect(getOvershootEscalation(-Infinity)).toBe("none");
  });
});
