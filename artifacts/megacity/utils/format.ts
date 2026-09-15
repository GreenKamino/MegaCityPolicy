export function formatCredits(n: number): string {
  if (!Number.isFinite(n)) return "MAX cr";
  n = Math.round(n);
  if (n >= 1e15) return "MAX cr";
  if (n <= -1e15) return "-MAX cr";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T cr`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B cr`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M cr`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K cr`;
  return `${n.toLocaleString()} cr`;
}

// Defense-in-depth: if a number ever escapes its in-engine cap (e.g. a
// legacy save predating MAX_POPULATION/MAX_EFFECTIVE_GROWTH_RATE), the
// formatter must NEVER fall back to JS scientific notation ("1.23e+45")
// — that string is wider than the column it lives in and visually crashes
// the overview banner. Render an explicit "MAX" sentinel instead so the
// player gets a clear signal something out-of-range happened.
const FORMAT_OVERFLOW_SENTINEL = "MAX";
const FORMAT_OVERFLOW_THRESHOLD = 1e15; // beyond 999T

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return FORMAT_OVERFLOW_SENTINEL;
  n = Math.round(n);
  if (n >= FORMAT_OVERFLOW_THRESHOLD) return FORMAT_OVERFLOW_SENTINEL;
  if (n <= -FORMAT_OVERFLOW_THRESHOLD) return `-${FORMAT_OVERFLOW_SENTINEL}`;
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPop(n: number): string {
  if (!Number.isFinite(n)) return FORMAT_OVERFLOW_SENTINEL;
  n = Math.round(n);
  if (n >= FORMAT_OVERFLOW_THRESHOLD) return FORMAT_OVERFLOW_SENTINEL;
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function pad(n: number, width: number = 2): string {
  return String(n).padStart(width, "0");
}

export function formatPercent(n: number, decimals: number = 0): string {
  return `${n.toFixed(decimals)}%`;
}

export function formatDelta(n: number): string {
  n = Math.round(n);
  const sign = n >= 0 ? "+" : "";
  if (Math.abs(n) >= 1_000_000_000_000) return `${sign}${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(n) >= 1_000_000_000) return `${sign}${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${sign}${(n / 1_000).toFixed(1)}K`;
  return `${sign}${n.toLocaleString()}`;
}

export function formatCatchupDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = Math.round(seconds - minutes * 60);
  return remSec > 0 ? `${minutes}m ${remSec}s` : `${minutes}m`;
}

export function formatResumedAmount(tickCount: number): string {
  const elapsedMinutes = tickCount * 15;
  if (elapsedMinutes >= 60 * 24) {
    const days = Math.round(elapsedMinutes / (60 * 24));
    return `${days} DAY${days !== 1 ? "S" : ""}`;
  }
  if (elapsedMinutes >= 60) {
    const hours = Math.round(elapsedMinutes / 60);
    return `${hours} HOUR${hours !== 1 ? "S" : ""}`;
  }
  return `${elapsedMinutes} MIN`;
}

export function shouldShowCatchupPill(catchupWallMs: number | undefined, tickCount: number): boolean {
  return typeof catchupWallMs === "number" && catchupWallMs >= 0.5 && tickCount > 0;
}

// Threshold tuning for the "resume took longer than expected" detector.
// Both the TickReportModal warning callout and the overview pill variant
// read these constants so the modal and the home-screen pill agree on
// what counts as an overshoot.
//   • OVERSHOOT_RATIO  — actual must be at least 1.5× the estimate before
//                        we warn (routine GC/scheduler variance is silent).
//   • OVERSHOOT_ABS_MS — and the gap must be at least ~400ms in absolute
//                        terms so a 6ms-vs-2ms catch-up doesn't trigger
//                        alarm bells just because the ratio is high.
export const OVERSHOOT_RATIO = 1.5;
export const OVERSHOOT_ABS_MS = 400;

/** True when the actual catch-up wall-time blew past the estimate by both
 *  a significant ratio AND a meaningful absolute amount. Returns false
 *  whenever either input is missing/non-positive so callers can pass
 *  optional values through. */
export function isResumeOvershoot(
  actualMs: number | undefined,
  estimatedMs: number | undefined,
): boolean {
  if (typeof actualMs !== "number" || actualMs <= 0) return false;
  if (typeof estimatedMs !== "number" || estimatedMs <= 0) return false;
  if (actualMs < estimatedMs * OVERSHOOT_RATIO) return false;
  if (actualMs - estimatedMs < OVERSHOOT_ABS_MS) return false;
  return true;
}

// Escalation tiers for the "this keeps happening" hint. The level is
// derived from how many recent overshoots are pinned in
// `state.recentResumeOvershoots`. Tiers:
//   • none     — current resume was on-budget (no warning at all).
//   • soft     — first overshoot, or a one-off after a clean streak.
//   • moderate — 2-3 of the last few resumes overshot; surface the
//                "(N×) RECENT" tag so players see the pattern.
//   • severe   — 4+ recent overshoots; escalate the wording to
//                "RESUME PERFORMANCE DEGRADING" with a stronger hint.
export type OvershootEscalation = "none" | "soft" | "moderate" | "severe";

/** Map a raw recent-overshoot count to an escalation tier. */
export function getOvershootEscalation(count: number): OvershootEscalation {
  if (!Number.isFinite(count) || count <= 0) return "none";
  if (count === 1) return "soft";
  if (count <= 3) return "moderate";
  return "severe";
}

// Ring-buffer caps for `state.recentResumeOvershoots`. Kept small so the
// field never measurably bloats the save (record is 3 numbers ≈ ~50
// bytes JSON; cap × that is negligible). TTL is in game ticks so an
// old player who comes back after weeks doesn't see escalation from
// long-stale entries — at 15 min/tick, 2000 ticks ≈ 3 weeks of
// in-game time, which is well past any device-state correlation.
export const RESUME_OVERSHOOT_HISTORY_CAP = 5;
export const RESUME_OVERSHOOT_TICK_TTL = 2000;

// Cap for the per-resume sample ring buffer (state.recentResumeSamples)
// that powers the trend list under OFFLINE SIM DEPTH in Settings.
// Matches the overshoot history cap so both buffers age out at the same
// pace, and keeps the save footprint negligible (~80 bytes / record).
export const RESUME_SAMPLE_HISTORY_CAP = 5;
// When at least this many of the last RESUME_SAMPLE_HISTORY_CAP samples
// were flagged as overshoots, surface the "Consider lowering depth"
// suggestion above the OFFLINE SIM DEPTH picker. 3-of-5 is a deliberate
// majority so a single bad resume never prompts the player to change a
// global setting.
export const RESUME_SAMPLE_SLOW_SUGGEST_THRESHOLD = 3;

/** Count how many of the given resume samples are flagged as overshoots
 *  by the same ratio + absolute-gap rule used for the warning pill. */
export function countSlowResumeSamples(
  samples: { actualMs: number; estimatedMs: number }[] | undefined,
): number {
  if (!samples || samples.length === 0) return 0;
  let n = 0;
  for (const s of samples) {
    if (isResumeOvershoot(s.actualMs, s.estimatedMs)) n += 1;
  }
  return n;
}

/** True when the recent-sample ring buffer shows enough slow resumes
 *  that we should suggest lowering OFFLINE SIM DEPTH. */
export function shouldSuggestLowerDepth(
  samples: { actualMs: number; estimatedMs: number }[] | undefined,
): boolean {
  return countSlowResumeSamples(samples) >= RESUME_SAMPLE_SLOW_SUGGEST_THRESHOLD;
}
