import type { CityStats } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #367: one-time "you just crossed into a better band" advisories for a few
// high-signal city stats, mirroring the biosphere-crisis-tier nudge (Task #365).
//
// Each tracked stat is scored into a 3-way band rank where 0 is the WORST band
// and 2 is the BEST band, regardless of whether higher or lower raw values are
// better. That way an improving transition is always a rank INCREASE, so the
// same idempotent last-seen-rank logic works for both directions.
//
// Band edges deliberately match the on-screen Overview StatGrid thresholds
// (green at the 65 mark, amber at the 35 mark, red below) so the celebratory
// copy lines up with what the player already sees on the gauges.
// ─────────────────────────────────────────────────────────────────────────────

export type StatBandRank = 0 | 1 | 2;

export type StatWinKey = "crime" | "happiness";

export interface StatWinBand {
  key: StatWinKey;
  label: string;
  // Reader for the raw stat value off cityStats.
  read: (cs: CityStats) => number | undefined;
  // [lower, upper] edges on the RAW stat value, lower < upper.
  edges: readonly [number, number];
  higherIsBetter: boolean;
  // Fallback used only when a malformed save is missing the stat, so migration
  // resolves to a sane band instead of crashing.
  neutral: number;
  // Advisory copy per improved band. There is no rank-0 nudge: you never
  // improve INTO the worst band.
  nudge: Record<Exclude<StatBandRank, 0>, { title: string; body: string }>;
}

// Score a raw value into a best-is-2 band rank.
export function rankForStat(
  value: number,
  edges: readonly [number, number],
  higherIsBetter: boolean,
): StatBandRank {
  const [lo, hi] = edges;
  if (higherIsBetter) return value >= hi ? 2 : value >= lo ? 1 : 0;
  // Lower is better: a small value is the best band.
  return value <= lo ? 2 : value <= hi ? 1 : 0;
}

export const STAT_WIN_BANDS: readonly StatWinBand[] = [
  {
    key: "crime",
    label: "Crime",
    read: (cs) => cs.crime,
    edges: [35, 65],
    higherIsBetter: false,
    neutral: 38,
    nudge: {
      1: {
        title: "CRIME EASING",
        body: "Your security forces are gaining ground. Crime has fallen out of the danger zone. Keep up patrols and enforcement to bring it fully under control.",
      },
      2: {
        title: "CRIME UNDER CONTROL",
        body: "Crime is now low across the city. Your policing and stability measures are holding, and steady enforcement keeps it there.",
      },
    },
  },
  {
    key: "happiness",
    label: "Happiness",
    read: (cs) => cs.happiness,
    edges: [35, 65],
    higherIsBetter: true,
    neutral: 45,
    nudge: {
      1: {
        title: "MORALE RECOVERING",
        body: "Public morale has climbed out of the low band. Citizens are steadier. Keep improving services and conditions to lift spirits further.",
      },
      2: {
        title: "MORALE HIGH",
        body: "Public morale is now high. Your governance and services are keeping citizens content, which eases unrest and supports productivity.",
      },
    },
  },
];

export const STAT_WIN_BAND_BY_KEY: Record<StatWinKey, StatWinBand> =
  STAT_WIN_BANDS.reduce(
    (acc, band) => {
      acc[band.key] = band;
      return acc;
    },
    {} as Record<StatWinKey, StatWinBand>,
  );

// Compute the current band rank for a stat, tolerant of a missing/partial
// cityStats (used by save migration on malformed saves).
export function computeStatBandRank(
  cs: Partial<CityStats> | undefined,
  band: StatWinBand,
): StatBandRank {
  const raw = cs ? band.read(cs as CityStats) : undefined;
  const value = typeof raw === "number" ? Math.round(raw) : band.neutral;
  return rankForStat(value, band.edges, band.higherIsBetter);
}
