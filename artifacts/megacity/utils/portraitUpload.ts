// UI-layer helper for picking and downsizing a custom commander portrait.
// Kept OUT of utils/customPortraits.ts so that module stays pure and
// node-test-safe; this one pulls in the expo-image-picker and
// expo-image-manipulator native modules.

import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";

import { isValidCustomPortraitUri } from "./customPortraits";

export type PortraitUploadResult =
  | { ok: true; dataUri: string }
  | { ok: false; reason: "cancelled" | "permission" | "invalid" };

// Shortest-edge target for the stored portrait. Portrait frames render at
// ~110px, so 256px keeps them crisp on high-DPI screens while the JPEG
// stays well under the profile's ~100 KB data-URI cap.
const TARGET_EDGE = 256;

/**
 * Opens the system photo picker, square-crops where the platform supports it,
 * downsizes to TARGET_EDGE on the shortest side, and returns a small JPEG
 * data URI ready to store on the profile.
 *
 * Aspect is preserved (resize sets only one dimension); every portrait frame
 * in the app renders with resizeMode="cover" in a square, so a non-square
 * upload (web picker has no crop step) is cropped visually, never distorted.
 */
export async function pickCustomPortrait(): Promise<PortraitUploadResult> {
  // The whole flow is wrapped so a throw from the native picker or from
  // manipulateAsync on a corrupt/unreadable image surfaces as the callers'
  // "UPLOAD FAILED" modal instead of an unhandled promise rejection.
  try {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: "permission" };
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) {
      return { ok: false, reason: "cancelled" };
    }

    const asset = picked.assets[0];
    const resize =
      (asset.width || 0) >= (asset.height || 1)
        ? { height: TARGET_EDGE }
        : { width: TARGET_EDGE };

    const out = await manipulateAsync(asset.uri, [{ resize }], {
      compress: 0.75,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!out.base64) return { ok: false, reason: "invalid" };

    const dataUri = `data:image/jpeg;base64,${out.base64}`;
    if (!isValidCustomPortraitUri(dataUri)) return { ok: false, reason: "invalid" };
    return { ok: true, dataUri };
  } catch (e) {
    console.warn("[portraitUpload] pickCustomPortrait failed:", e);
    return { ok: false, reason: "invalid" };
  }
}
