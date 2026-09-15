// Registry + validation for player-uploaded custom portraits.
//
// Kept as a tiny pure module (no react-native / asset imports) so node-based
// vitest suites can import it directly — utils/portraits.ts cannot load under
// node because of its .webp require() calls.
//
// Data model: the image itself lives INLINE on the owning PlayerProfile as a
// base64 data URI (profile.customPortraitUri), so it persists through
// AsyncStorage, rides the profile cloud-sync bundle, and dies with the
// profile on delete. GameState only ever stores the lightweight sentinel
// portrait id ("custom_<profileId>") — keeping image bytes out of save
// payloads protects the save-size perf budgets.
//
// This in-memory registry maps profileId -> data URI at runtime so that
// getPortrait() can resolve the sentinel id synchronously from render code.
// GameContext hydrates it in refreshProfiles() before profiles reach the UI,
// and updates it on upload / profile delete.

export const CUSTOM_PORTRAIT_PREFIX = "custom_";

// Hard cap on the stored data-URI length (~100 KB). A 256px JPEG at 0.75
// quality lands around 15-30 KB as base64, so this is generous headroom
// while still keeping the profile blob (and its cloud bundle) small.
export const MAX_CUSTOM_PORTRAIT_URI_LENGTH = 100_000;

const registry = new Map<string, string>();

export function customPortraitIdFor(profileId: string): string {
  return `${CUSTOM_PORTRAIT_PREFIX}${profileId}`;
}

export function isCustomPortraitId(portraitId: string | undefined | null): boolean {
  return typeof portraitId === "string" && portraitId.startsWith(CUSTOM_PORTRAIT_PREFIX);
}

/** True when the value is a plausible, size-capped image data URI. */
export function isValidCustomPortraitUri(uri: unknown): uri is string {
  return (
    typeof uri === "string" &&
    uri.startsWith("data:image/") &&
    uri.length > "data:image/".length &&
    uri.length <= MAX_CUSTOM_PORTRAIT_URI_LENGTH
  );
}

/**
 * Registers a profile's uploaded portrait for render-time resolution.
 * Returns false (and stores nothing) for invalid or oversized URIs, so a
 * corrupted profile blob can never wedge the registry with garbage.
 */
export function registerCustomPortrait(profileId: string, dataUri: unknown): boolean {
  if (!profileId || !isValidCustomPortraitUri(dataUri)) return false;
  registry.set(profileId, dataUri);
  return true;
}

export function unregisterCustomPortrait(profileId: string): void {
  registry.delete(profileId);
}

/** Resolves a "custom_<profileId>" portrait id to its registered data URI, or null. */
export function resolveCustomPortrait(portraitId: string | undefined | null): string | null {
  if (!isCustomPortraitId(portraitId)) return null;
  const profileId = (portraitId as string).slice(CUSTOM_PORTRAIT_PREFIX.length);
  return registry.get(profileId) ?? null;
}

/** Test helper: wipes the registry so suites start from a clean slate. */
export function clearCustomPortraitRegistry(): void {
  registry.clear();
}
