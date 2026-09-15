import { useEffect, useRef } from "react";
import { useSettings } from "@/context/SettingsContext";
import { useGameStateSelector } from "@/context/GameContext";
import { playSound, setAmbienceBed, stopAllAmbience } from "@/engine/audio";
import {
  computeTensionScore,
  resolveMood,
  moodBeds,
  moodOneShots,
  type AmbienceMood,
} from "@/engine/ambience";

// Reactive ambient audio driver (Task #314).
//
// Renders nothing. Subscribes to the live city mood signals and translates them
// into a looping ambience bed (city_ambience + an unrest rumble that fades in as
// things sour) plus rate-limited contextual one-shots (sirens, protest chants,
// distant gunfire...). All scheduling lives in JS timers here — nothing is added
// to the engine's per-tick runTick path, so there is zero per-tick budget cost.
//
// Mood is recomputed only when the underlying stats change (useGameStateSelector
// re-renders on slice change), and the actual mood resolution uses hysteresis so
// a stat hovering on a threshold doesn't flip the soundscape back and forth.

const MOOD_REEVAL_MS = 6000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function AmbienceDriver() {
  const ambienceEnabled = useSettings().ambienceEnabled;
  const soundMuted = useSettings().soundMuted;
  const reducedMotion = useSettings().reducedMotion;

  // Live mood signals. Each selector returns a primitive so the component only
  // re-renders when one of these four actually changes.
  const unrest = useGameStateSelector((s) => s.cityStats?.unrest ?? 0);
  const crime = useGameStateSelector((s) => s.cityStats?.crime ?? 0);
  const happiness = useGameStateSelector((s) => s.cityStats?.happiness ?? 0);
  const lawOrder = useGameStateSelector((s) => s.cityStats?.lawOrder ?? 0);
  const tickPaused = useGameStateSelector((s) => s.tickPaused ?? false);

  const moodRef = useRef<AmbienceMood | null>(null);
  const oneShotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold the latest mood-derived params in refs so the self-rescheduling
  // one-shot loop always reads current values without resetting its timer.
  const planRef = useRef({ reducedMotion });
  planRef.current.reducedMotion = reducedMotion;

  const active = ambienceEnabled && !soundMuted && !tickPaused;

  // ── Drive the looping beds from the current mood ──────────────────────────
  useEffect(() => {
    if (!active) {
      moodRef.current = null;
      stopAllAmbience();
      return;
    }
    const score = computeTensionScore({ unrest, crime, happiness, lawOrder });
    const mood = resolveMood(score, moodRef.current);
    moodRef.current = mood;
    const beds = moodBeds(mood);
    setAmbienceBed("city_ambience", beds.base);
    setAmbienceBed("unrest_high", beds.unrest);
  }, [active, unrest, crime, happiness, lawOrder]);

  // ── Rate-limited contextual one-shots ─────────────────────────────────────
  useEffect(() => {
    if (!active) {
      if (oneShotTimer.current) {
        clearTimeout(oneShotTimer.current);
        oneShotTimer.current = null;
      }
      return;
    }

    let cancelled = false;

    const schedule = (delay: number) => {
      oneShotTimer.current = setTimeout(() => {
        if (cancelled) return;
        const mood = moodRef.current ?? "calm";
        const plan = moodOneShots(mood, planRef.current.reducedMotion);
        if (plan) {
          playSound(pick(plan.pool));
          const span = plan.maxIntervalMs - plan.minIntervalMs;
          schedule(plan.minIntervalMs + Math.random() * span);
        } else {
          // Reduced motion left nothing tasteful for this mood; re-check soon.
          schedule(MOOD_REEVAL_MS);
        }
      }, delay);
    };

    // First one-shot is delayed so entering the game isn't immediately noisy.
    schedule(8000 + Math.random() * 6000);

    return () => {
      cancelled = true;
      if (oneShotTimer.current) {
        clearTimeout(oneShotTimer.current);
        oneShotTimer.current = null;
      }
    };
  }, [active]);

  // Stop everything on unmount.
  useEffect(() => () => { stopAllAmbience(); }, []);

  return null;
}
