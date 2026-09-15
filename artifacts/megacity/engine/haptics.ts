import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export type HapticIntensity = "light" | "medium" | "heavy" | "error";

const isWeb = Platform.OS === "web";

let enabled = true;
let reducedMotion = false;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

export function setHapticsReducedMotion(v: boolean) {
  reducedMotion = v;
}

export function isHapticsEnabled(): boolean {
  return !isWeb && enabled && !reducedMotion;
}

export function playHaptic(intensity: HapticIntensity): void {
  if (isWeb) return;
  if (!enabled || reducedMotion) return;
  try {
    switch (intensity) {
      case "light":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return;
      case "medium":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        return;
      case "heavy":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        return;
      case "error":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
    }
  } catch {
  }
}
