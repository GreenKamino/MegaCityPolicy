// Pure helpers for the offline-simulation-depth setting. Kept dependency-free
// (no React, no React Native, no AsyncStorage) so engine tests and the
// SettingsContext / GameContext consumers can both import without dragging
// the RN module graph into a node-only test environment.

export type OfflineSimDepth = "lite" | "standard" | "deep";

// Maps the user-facing offline-simulation-depth preset to the `batchLimit`
// passed to processMissedTicks. Lite trades fidelity for fast resume; Deep
// trades wall-clock resume time for guaranteed coverage of long absences
// (events, edicts, faction beats fully simulated rather than extrapolated).
// At ~2 ms/tick this is roughly: Lite ≈ 0.5s, Standard ≈ 3s, Deep ≈ 12s.
export const OFFLINE_SIM_DEPTH_BATCH_LIMIT: Record<OfflineSimDepth, number> = {
  lite: 250,
  standard: 1500,
  deep: 6000,
};

// Coerce arbitrary input (e.g. a corrupted/imported profile or an old save
// migrated from a future build) to a known preset. Anything unrecognized
// falls back to "standard" — the historical default — so downstream
// arithmetic (Math.min(missed, batchLimit), simulatedTicks, etc.) never
// degrades into NaN and the offline-summary warning stays accurate.
export function normalizeOfflineSimDepth(value: unknown): OfflineSimDepth {
  return value === "lite" || value === "standard" || value === "deep"
    ? value
    : "standard";
}
