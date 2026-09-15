import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getReleaseIntegrityStatus,
  initReleaseIntegrity,
  subscribeReleaseIntegrity,
  type ReleaseIntegrityStatus,
} from "@/engine/releaseIntegrity";
import { useTheme } from "@/context/ThemeContext";

function reasonText(reason: string): string {
  switch (reason) {
    case "missing-file": return "A shipped release file is missing.";
    case "changed-file": return "A shipped release file does not match its release hash.";
    case "malformed-manifest": return "The release integrity manifest is malformed.";
    case "manifest-missing": return "The release integrity manifest could not be read.";
    default: return "Release-file verification could not be completed.";
  }
}

export default function ReleaseIntegrityWarning() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<ReleaseIntegrityStatus>(
    getReleaseIntegrityStatus(),
  );
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeReleaseIntegrity(setStatus);
    initReleaseIntegrity().then(setStatus).catch(() => {});
    return unsubscribe;
  }, []);

  if (status.mode !== "packaged" || status.trusted) return null;
  if (hidden) return null;

  return (
    <View
      style={[styles.overlay, { top: Math.max(insets.top + 8, 12) }]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.banner, { backgroundColor: colors.bgCard, borderColor: colors.danger }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <Text style={[styles.title, { color: colors.danger }]}>
          RELEASE FILE WARNING
        </Text>
        <Text style={[styles.message, { color: colors.text }]}>
          {reasonText(status.reason)} Achievements and Steam sync are disabled
          until the installed files are restored. You can continue playing
          offline; this does not alter or permanently taint your saves.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss release file warning"
          onPress={() => setHidden(true)}
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.dismissText, { color: colors.warning }]}>ACKNOWLEDGE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 10000,
    elevation: 10000,
    alignItems: "center",
  },
  banner: {
    width: "100%",
    maxWidth: 720,
    borderWidth: 2,
    borderRadius: 6,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  dismiss: {
    alignSelf: "flex-end",
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  dismissText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
});