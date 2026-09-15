// Per-slot save lock used by GameContext.saveToSlot to keep background-save
// and autosave from racing on the same slot key.
//
// AsyncStorage writes aren't atomic — two overlapping setItem calls to the
// same key can interleave and produce a corrupted UTF-16 payload. This lock
// keys an in-flight Promise per slot id; concurrent callers on the same slot
// share the same Promise (so the underlying writer fires once), while calls
// on different slots run independently.
//
// Extracted to its own module so it can be unit-tested directly without
// mounting the full GameProvider (which pulls in expo / react-native / etc).

export type SlotLockKey = string | number;

export type SaveSessionSnapshot = {
  epoch: number;
  profileId: string | null;
};

/** True only while an async save still belongs to the playable session that
 * requested it. Profile/city transitions increment the epoch. */
export function isSaveSessionCurrent(
  snapshot: SaveSessionSnapshot,
  currentEpoch: number,
  currentProfileId: string | null,
  isActive: boolean,
): boolean {
  return (
    isActive &&
    snapshot.epoch === currentEpoch &&
    snapshot.profileId === currentProfileId
  );
}

export type SlotLock = {
  // Run `task` exclusively for `slot`. If a task is already in flight for
  // this slot, the existing promise is returned and `task` is NOT invoked.
  // The lock entry is cleared after the in-flight promise settles (resolve
  // or reject), so subsequent calls trigger a fresh run.
  run: <T>(slot: SlotLockKey, task: () => Promise<T>) => Promise<T | undefined>;
  // Exposed for tests / diagnostics. Do not mutate from outside.
  readonly inFlight: Map<SlotLockKey, Promise<unknown>>;
};

export function createSlotLock(): SlotLock {
  const inFlight = new Map<SlotLockKey, Promise<unknown>>();
  const run = async <T>(slot: SlotLockKey, task: () => Promise<T>): Promise<T | undefined> => {
    const existing = inFlight.get(slot) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => task())();
    inFlight.set(slot, p);
    try {
      return await p;
    } finally {
      if (inFlight.get(slot) === p) inFlight.delete(slot);
    }
  };
  return { run, inFlight };
}
