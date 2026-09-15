import React, { useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

import { useTheme } from "@/context/ThemeContext";

type Props = {
  text: string;
  children: React.ReactNode;
};

function HoverTooltip({ text, children }: Props) {
  const { colors: c } = useTheme();
  const [visible, setVisible] = useState(false);

  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  const webHandlers = Platform.OS === "web" ? {
    onMouseEnter: () => setVisible(true),
    onMouseLeave: () => setVisible(false),
  } : {};

  return (
    <View
      {...(webHandlers as any)}
      style={styles.wrapper}
    >
      {children}
      {visible && (
        <View style={[styles.tooltip, { backgroundColor: c.bgElevated, borderColor: c.borderBright }]}>
          <Text style={[styles.tooltipText, { color: c.text }]}>{text}</Text>
          <View style={[styles.arrow, { borderTopColor: c.borderBright }]} />
        </View>
      )}
    </View>
  );
}

export default React.memo(HoverTooltip);

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  tooltip: {
    position: "absolute",
    bottom: "100%",
    alignSelf: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 999,
    minWidth: 80,
    left: 0,
    right: 0,
  },
  tooltipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
  },
  arrow: {
    position: "absolute",
    bottom: -4,
    alignSelf: "center",
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
