import { CATEGORY_LABELS, type FirstCategory } from "@/engine/firsts";

// Pure helper that mirrors the deep-link parsing used by the Trophy Wall
// (`firsts.tsx`). Accepts the raw value produced by expo-router's
// useLocalSearchParams (`string | string[] | undefined`) and validates it
// against the known first categories so a stale or malformed URL falls back
// to the "all" filter. Lifted out of the screen so it can be unit tested
// without spinning up react-native imports.
export function resolveInitialAtlasCategory(
  raw: string | string[] | undefined
): FirstCategory | "all" {
  const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const valid = new Set<string>(Object.keys(CATEGORY_LABELS));
  return valid.has(value) ? (value as FirstCategory) : "all";
}
