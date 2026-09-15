import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const SOUND_FILES = {
  ui_tap: require("@/assets/sounds/ui_tap.wav"),
  ui_toggle: require("@/assets/sounds/ui_toggle.wav"),
  modal_open: require("@/assets/sounds/modal_open.wav"),
  modal_close: require("@/assets/sounds/modal_close.wav"),
  alert_warning: require("@/assets/sounds/alert_warning.wav"),
  credits_gain: require("@/assets/sounds/credits_gain.wav"),
  credits_loss: require("@/assets/sounds/credits_loss.wav"),
  message_ping: require("@/assets/sounds/message_ping.wav"),
  confirm: require("@/assets/sounds/confirm.wav"),
  error: require("@/assets/sounds/error.wav"),
  research: require("@/assets/sounds/research.wav"),
  build: require("@/assets/sounds/build.wav"),
  deploy: require("@/assets/sounds/deploy.wav"),
  achievement: require("@/assets/sounds/achievement.wav"),
  save: require("@/assets/sounds/save.wav"),
  tick: require("@/assets/sounds/tick.wav"),
  navigate: require("@/assets/sounds/navigate.wav"),
  alert: require("@/assets/sounds/alert.wav"),
  city_chatter: require("@/assets/sounds/city_chatter.wav"),
  unrest_low: require("@/assets/sounds/unrest_low.wav"),
  unrest_high: require("@/assets/sounds/unrest_high.wav"),
  siren: require("@/assets/sounds/siren.wav"),
  city_ambience: require("@/assets/sounds/city_ambience.wav"),
  protest_chant: require("@/assets/sounds/protest_chant.wav"),
  gunfire_distant: require("@/assets/sounds/gunfire_distant.wav"),
  explosion_distant: require("@/assets/sounds/explosion_distant.wav"),
  // Sustained gun-battle clip for raider attacks / open warfare — sourced CC0 from freesound.org (sound 34065)
  raider_attack: require("@/assets/sounds/raider_attack.mp3"),
  // Geiger counter ticks — sourced CC0 from freesound.org (JustLaz, sounds 616511 & 616517)
  geiger_loop: require("@/assets/sounds/geiger_loop.mp3"),
  geiger_burst: require("@/assets/sounds/geiger_burst.mp3"),
  // Main-menu background music (user-provided track). Driven as a loop via
  // startSoundLoop/stopSoundLoop from the title screen; shares the engine's
  // mute + volume so the existing sound settings control it too.
  menu_music: require("@/assets/sounds/menu_music.mp3"),
} as const;

export type SoundId = keyof typeof SOUND_FILES;

const players: Partial<Record<SoundId, AudioPlayer>> = {};
let muted = false;
let volume = 0.6;
let initialised = false;

async function init() {
  if (initialised) return;
  initialised = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
  } catch {}
}

function getPlayer(id: SoundId): AudioPlayer | null {
  if (players[id]) return players[id]!;
  try {
    const p = createAudioPlayer(SOUND_FILES[id]);
    p.volume = volume;
    p.muted = muted;
    players[id] = p;
    return p;
  } catch {
    return null;
  }
}

export async function playSound(id: SoundId) {
  if (muted) return;
  await init();
  const p = getPlayer(id);
  if (!p) return;
  try {
    p.volume = volume;
    p.muted = false;
    try { await p.seekTo(0); } catch {}
    void Promise.resolve(p.play()).catch(() => {});
  } catch {}
}

const looping: Partial<Record<SoundId, boolean>> = {};

export async function startSoundLoop(id: SoundId) {
  if (looping[id]) return;
  looping[id] = true;
  await init();
  if (!looping[id]) return;
  const p = getPlayer(id);
  if (!p) { looping[id] = false; return; }
  try {
    p.loop = true;
    p.volume = volume;
    p.muted = muted;
    try { await p.seekTo(0); } catch {}
    if (!looping[id]) { try { p.pause(); } catch {} return; }
    void Promise.resolve(p.play()).catch(() => {});
  } catch { looping[id] = false; }
}

export function stopSoundLoop(id: SoundId) {
  const wasLooping = looping[id];
  looping[id] = false;
  if (!wasLooping) return;
  const p = players[id];
  if (!p) return;
  try {
    p.pause();
    p.loop = false;
  } catch {}
}

// ─── REACTIVE AMBIENCE LAYER (Task #314) ──────────────────────────────────
// A small set of looping "beds" (e.g. city_ambience, unrest_high) whose volume
// is mixed independently of one-shot SFX so the soundscape can react to the
// city's mood. Each bed keeps its own gain (0..1) relative to the master
// `volume`; the effective player volume is `volume * gain`. Beds are exempt
// from the blanket re-volume in setVolume() so a master-volume change preserves
// their mix instead of snapping them to full. The AmbienceDriver component owns
// the mood logic; this engine just executes start/stop/fade requests.
let ambienceEnabled = true;
// Ambience beds own DEDICATED player instances, kept separate from the shared
// one-shot `players` map. This matters because some bed sounds (e.g.
// unrest_high) are *also* fired as event one-shots — sharing a single player
// would let a one-shot reset the looping bed's volume / playhead. Separate
// instances keep the two layers fully independent.
const ambiencePlayers: Partial<Record<SoundId, AudioPlayer>> = {};
const ambienceGain: Partial<Record<SoundId, number>> = {};
const ambiencePlaying: Partial<Record<SoundId, boolean>> = {};
const ambienceFadeTimers: Partial<Record<SoundId, ReturnType<typeof setInterval>>> = {};
const AMBIENCE_FADE_STEP_MS = 80;
// Bumped by every stop/disable. setAmbienceBed captures it before its awaits
// (init / seekTo) and aborts the start if it changed — so a pause/background
// that races in while a bed is mid-start can't leave audio playing after
// deactivation.
let ambienceGeneration = 0;

function getAmbiencePlayer(id: SoundId): AudioPlayer | null {
  if (ambiencePlayers[id]) return ambiencePlayers[id]!;
  try {
    const p = createAudioPlayer(SOUND_FILES[id]);
    p.loop = true;
    p.volume = volume * (ambienceGain[id] ?? 0);
    p.muted = muted;
    ambiencePlayers[id] = p;
    return p;
  } catch {
    return null;
  }
}

function applyAmbienceVolume(id: SoundId) {
  const p = ambiencePlayers[id];
  if (!p) return;
  const g = ambienceGain[id] ?? 0;
  try {
    p.volume = volume * g;
    p.muted = muted;
  } catch {}
}

function clearAmbienceFade(id: SoundId) {
  const t = ambienceFadeTimers[id];
  if (t) {
    clearInterval(t);
    delete ambienceFadeTimers[id];
  }
}

function fadeAmbienceGain(id: SoundId, target: number, durationMs: number, onDone?: () => void) {
  clearAmbienceFade(id);
  const start = ambienceGain[id] ?? 0;
  const end = Math.max(0, Math.min(1, target));
  if (durationMs <= 0 || start === end) {
    ambienceGain[id] = end;
    applyAmbienceVolume(id);
    onDone?.();
    return;
  }
  const steps = Math.max(1, Math.round(durationMs / AMBIENCE_FADE_STEP_MS));
  let i = 0;
  ambienceFadeTimers[id] = setInterval(() => {
    i++;
    const k = Math.min(1, i / steps);
    ambienceGain[id] = start + (end - start) * k;
    applyAmbienceVolume(id);
    if (i >= steps) {
      clearAmbienceFade(id);
      ambienceGain[id] = end;
      applyAmbienceVolume(id);
      onDone?.();
    }
  }, AMBIENCE_FADE_STEP_MS);
}

// Set a looping ambience bed to a target mix level (0..1), cross-fading over
// `fadeMs`. Starts the loop on demand; once a bed fades to ~0 it is paused to
// free the audio channel. No-ops to silence while ambience is disabled.
export async function setAmbienceBed(id: SoundId, level: number, fadeMs = 1400) {
  if (!(id in ambienceGain)) ambienceGain[id] = 0;
  const target = ambienceEnabled ? Math.max(0, Math.min(1, level)) : 0;

  if (target > 0) {
    const gen = ambienceGeneration;
    await init();
    // A stop/disable raced in while init() was pending — abort the start.
    if (gen !== ambienceGeneration || !ambienceEnabled) return;
    if (!ambiencePlaying[id]) {
      const p = getAmbiencePlayer(id);
      if (!p) return;
      try {
        p.loop = true;
        p.muted = muted;
        p.volume = volume * (ambienceGain[id] ?? 0);
        try { await p.seekTo(0); } catch {}
        // Re-check after the seek await too, then commit to playback.
        if (gen !== ambienceGeneration || !ambienceEnabled) {
          try { p.pause(); } catch {}
          return;
        }
        void Promise.resolve(p.play()).catch(() => {});
        ambiencePlaying[id] = true;
      } catch {
        return;
      }
    }
    fadeAmbienceGain(id, target, fadeMs);
  } else {
    fadeAmbienceGain(id, 0, fadeMs, () => {
      const p = ambiencePlayers[id];
      if (p) {
        try { p.pause(); } catch {}
      }
      ambiencePlaying[id] = false;
    });
  }
}

// Fade out and stop every ambience bed (e.g. on pause or when the player
// disables the layer).
export function stopAllAmbience(fadeMs = 600) {
  // Cancel any in-flight bed start (see ambienceGeneration).
  ambienceGeneration++;
  for (const id of Object.keys(ambienceGain) as SoundId[]) {
    if (ambiencePlaying[id]) setAmbienceBed(id, 0, fadeMs);
  }
}

export function setAmbienceEnabled(on: boolean) {
  ambienceEnabled = on;
  if (!on) stopAllAmbience();
}

export function isAmbienceEnabled(): boolean {
  return ambienceEnabled;
}

export function setMuted(m: boolean) {
  muted = m;
  for (const p of Object.values(players)) {
    if (p) {
      try { p.muted = m; } catch {}
    }
  }
  for (const p of Object.values(ambiencePlayers)) {
    if (p) {
      try { p.muted = m; } catch {}
    }
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  for (const p of Object.values(players)) {
    if (p) {
      try { p.volume = volume; } catch {}
    }
  }
  // Ambience beds carry their own mix gain; reapply gain*volume so a master
  // volume change keeps their relative level instead of snapping to full.
  for (const k of Object.keys(ambiencePlayers) as SoundId[]) {
    applyAmbienceVolume(k);
  }
}

export function getVolume(): number {
  return volume;
}

export async function unloadAll() {
  for (const k of Object.keys(ambienceFadeTimers) as SoundId[]) clearAmbienceFade(k);
  for (const p of Object.values(ambiencePlayers)) {
    try { p?.remove(); } catch {}
  }
  for (const k of Object.keys(ambiencePlayers) as SoundId[]) {
    delete ambiencePlayers[k];
    delete ambienceGain[k];
    delete ambiencePlaying[k];
  }
  for (const p of Object.values(players)) {
    try { p?.remove(); } catch {}
  }
  for (const k of Object.keys(players)) {
    delete players[k as SoundId];
  }
}
