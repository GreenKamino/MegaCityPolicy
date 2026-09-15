// Reactive ambience mood mapping (Task #314).
//
// Pure, dependency-free helpers that translate the live city stats into an
// ambient "mood". Kept free of any expo-audio / React imports so it can be
// unit-tested in the node test runner and reused by the AmbienceDriver
// component without dragging the audio engine into the test graph.
//
// The driver owns all timers and the actual sound playback; this module only
// decides *what* the soundscape should be, given the numbers.

// Sound ids the ambience layer is allowed to use. Every entry here is also a
// valid SoundId in engine/audio.ts (the driver passes them straight to
// playSound / the ambience bed API), but we keep the union local so this file
// never needs to import the audio engine.
export type AmbienceSoundId =
  | "city_ambience"
  | "unrest_high"
  | "city_chatter"
  | "unrest_low"
  | "protest_chant"
  | "siren"
  | "gunfire_distant"
  | "explosion_distant";

export type AmbienceMood = "calm" | "uneasy" | "tense" | "crisis";

export type AmbienceInputs = {
  unrest: number; // 0..100, higher = worse
  crime: number; // 0..100, higher = worse
  happiness: number; // 0..100, higher = better
  lawOrder: number; // 0..100, higher = calmer
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Collapse the four signals into a single 0..100 "tension" score. Unrest is
// the dominant driver, crime second, low happiness third; strong law & order
// takes the edge off the perceived tension. Weights are deliberately gentle so
// a healthy city sits comfortably in the calm/uneasy bands and only a genuinely
// troubled city reaches crisis.
export function computeTensionScore(s: AmbienceInputs): number {
  const unrest = clamp(s.unrest, 0, 100);
  const crime = clamp(s.crime, 0, 100);
  const happiness = clamp(s.happiness, 0, 100);
  const lawOrder = clamp(s.lawOrder, 0, 100);
  const raw =
    0.45 * unrest +
    0.3 * crime +
    0.25 * (100 - happiness) -
    0.2 * lawOrder;
  return clamp(raw, 0, 100);
}

// Band entry thresholds (ascending). A score >= a band's `min` qualifies for
// that band when tension is rising.
const BANDS: { mood: AmbienceMood; min: number }[] = [
  { mood: "calm", min: 0 },
  { mood: "uneasy", min: 28 },
  { mood: "tense", min: 48 },
  { mood: "crisis", min: 70 },
];

// How far the score must fall *below* the current band's entry threshold before
// we step down a band. Prevents rapid flip-flopping when a stat hovers on a
// boundary. Rising is responsive (can jump straight to crisis); falling is
// damped.
export const MOOD_HYSTERESIS = 7;

function bandIndexForScore(score: number): number {
  let idx = 0;
  for (let i = 0; i < BANDS.length; i++) {
    if (score >= BANDS[i].min) idx = i;
  }
  return idx;
}

// Resolve the next mood from the current score and the previous mood, applying
// hysteresis on the way down. With no previous mood (first run) the raw band is
// returned.
export function resolveMood(score: number, prev: AmbienceMood | null): AmbienceMood {
  const clamped = clamp(score, 0, 100);
  if (prev == null) return BANDS[bandIndexForScore(clamped)].mood;

  const prevIdx = Math.max(
    0,
    BANDS.findIndex((b) => b.mood === prev),
  );
  let idx = prevIdx;

  // Rise: jump up as many bands as the score clears.
  while (idx < BANDS.length - 1 && clamped >= BANDS[idx + 1].min) idx++;

  // Fall: step down one band at a time, only once the score drops a full
  // hysteresis margin below the current band's entry threshold.
  while (idx > 0 && clamped < BANDS[idx].min - MOOD_HYSTERESIS) idx--;

  return BANDS[idx].mood;
}

// Continuous loop bed levels per mood. `base` is the constant city hum
// (city_ambience); `unrest` is a low rumble bed (unrest_high) that fades in as
// the city sours. Values are 0..1 mix levels relative to the master sound
// volume — kept well under 1 so ambience never overpowers UI/event SFX.
export type AmbienceBeds = {
  base: number;
  unrest: number;
};

export function moodBeds(mood: AmbienceMood): AmbienceBeds {
  switch (mood) {
    case "calm":
      return { base: 0.45, unrest: 0 };
    case "uneasy":
      return { base: 0.55, unrest: 0.1 };
    case "tense":
      return { base: 0.62, unrest: 0.26 };
    case "crisis":
      return { base: 0.68, unrest: 0.42 };
  }
}

// One-shot ids that are startling enough to suppress when the player has asked
// for reduced motion / a calmer experience.
const STARTLING: ReadonlySet<AmbienceSoundId> = new Set<AmbienceSoundId>([
  "siren",
  "gunfire_distant",
  "explosion_distant",
  "unrest_high",
]);

export type OneShotPlan = {
  pool: AmbienceSoundId[];
  minIntervalMs: number;
  maxIntervalMs: number;
};

const RAW_ONE_SHOTS: Record<AmbienceMood, OneShotPlan> = {
  calm: {
    pool: ["city_chatter"],
    minIntervalMs: 24000,
    maxIntervalMs: 42000,
  },
  uneasy: {
    pool: ["city_chatter", "unrest_low"],
    minIntervalMs: 20000,
    maxIntervalMs: 34000,
  },
  tense: {
    pool: ["unrest_low", "protest_chant", "siren", "city_chatter"],
    minIntervalMs: 15000,
    maxIntervalMs: 26000,
  },
  crisis: {
    // unrest_high is intentionally omitted here — it runs as the continuous
    // tense bed in crisis, so firing it as a one-shot too would just double it.
    pool: ["siren", "protest_chant", "gunfire_distant", "explosion_distant"],
    minIntervalMs: 11000,
    maxIntervalMs: 20000,
  },
};

// The contextual one-shot plan for a mood. When `reducedMotion` is set the
// startling sounds are filtered out and the cadence is stretched so the layer
// stays gentle; if nothing tasteful remains, returns null (no one-shots).
export function moodOneShots(
  mood: AmbienceMood,
  reducedMotion: boolean,
): OneShotPlan | null {
  const base = RAW_ONE_SHOTS[mood];
  if (!reducedMotion) return { ...base, pool: [...base.pool] };

  const pool = base.pool.filter((id) => !STARTLING.has(id));
  if (pool.length === 0) return null;
  return {
    pool,
    minIntervalMs: Math.round(base.minIntervalMs * 1.6),
    maxIntervalMs: Math.round(base.maxIntervalMs * 1.6),
  };
}
