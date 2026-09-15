import { describe, expect, it } from "vitest";

import {
  countSlowResumeSamples,
  RESUME_SAMPLE_HISTORY_CAP,
  RESUME_SAMPLE_SLOW_SUGGEST_THRESHOLD,
  shouldSuggestLowerDepth,
} from "@/utils/format";

// Slow sample: actual blows past estimate by both the ratio (>=1.5×)
// AND the absolute gap (>=400ms) gates that isResumeOvershoot enforces.
const slow = { actualMs: 1500, estimatedMs: 500 };
// Fast sample: well within budget — neither gate trips.
const fast = { actualMs: 200, estimatedMs: 300 };

describe("countSlowResumeSamples", () => {
  it("returns 0 when the buffer is missing or empty", () => {
    expect(countSlowResumeSamples(undefined)).toBe(0);
    expect(countSlowResumeSamples([])).toBe(0);
  });

  it("counts only samples that overshoot both ratio + abs gates", () => {
    expect(countSlowResumeSamples([fast, fast, fast])).toBe(0);
    expect(countSlowResumeSamples([slow, fast, slow])).toBe(2);
    expect(countSlowResumeSamples([slow, slow, slow, slow, slow])).toBe(5);
  });
});

describe("shouldSuggestLowerDepth", () => {
  it("is false when there are no samples", () => {
    expect(shouldSuggestLowerDepth(undefined)).toBe(false);
    expect(shouldSuggestLowerDepth([])).toBe(false);
  });

  it("is false below the slow-suggest threshold", () => {
    expect(shouldSuggestLowerDepth([slow, fast, fast, fast, fast])).toBe(false);
    expect(shouldSuggestLowerDepth([slow, slow, fast, fast, fast])).toBe(false);
  });

  it("is true once at least the threshold-many recent samples were slow", () => {
    expect(shouldSuggestLowerDepth([slow, slow, slow, fast, fast])).toBe(true);
    expect(shouldSuggestLowerDepth([slow, slow, slow, slow, slow])).toBe(true);
  });

  it("threshold is a strict majority of the cap (3-of-5) so a single bad resume can't trigger", () => {
    expect(RESUME_SAMPLE_SLOW_SUGGEST_THRESHOLD).toBeGreaterThan(RESUME_SAMPLE_HISTORY_CAP / 2);
  });
});
