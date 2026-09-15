import React, { useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { useHover, cursorPointer } from "@/hooks/useMouse";
import { playHaptic } from "@/engine/haptics";

type Props = {
  label: string;
  subtitle?: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "warning" | "muted";
  disabled?: boolean;
  rightText?: string;
  leftIcon?: React.ReactNode;
};

function getVariantStyles(c: ThemePalette) {
  return {
    primary: {
      border: c.accent,
      text: c.accent,
      bg: c.accent + "0D",
      hoverBg: c.accent + "26",
    },
    secondary: {
      border: c.borderBright,
      text: c.text,
      bg: c.bgCard,
      hoverBg: c.bgElevated,
    },
    danger: {
      border: c.danger,
      text: c.danger,
      bg: c.danger + "12",
      hoverBg: c.danger + "2E",
    },
    warning: {
      border: c.warning,
      text: c.warning,
      bg: c.warning + "12",
      hoverBg: c.warning + "2E",
    },
    muted: {
      border: c.border,
      text: c.textMuted,
      bg: c.bg,
      hoverBg: c.bgCard,
    },
  };
}

function MenuButton({
  label,
  subtitle,
  onPress,
  variant = "secondary",
  disabled = false,
  rightText,
  leftIcon,
}: Props) {
  const { colors: c } = useTheme();
  const variants = useMemo(() => getVariantStyles(c), [c]);
  const v = variants[variant];
  const { hovered, handlers } = useHover();

  const handlePress = useCallback(() => {
    playHaptic(variant === "danger" ? "error" : "light");
    onPress();
  }, [onPress, variant]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      {...handlers}
      style={({ pressed }) => [
        styles.button,
        !disabled && cursorPointer,
        {
          borderColor: disabled ? c.border : hovered ? v.text : v.border,
          backgroundColor: pressed ? c.bgElevated : hovered ? v.hoverBg : v.bg,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View style={styles.left}>
        {leftIcon && <View style={styles.iconWrap}>{leftIcon}</View>}
        <View style={styles.textWrap}>
          <Text style={[styles.label, { color: disabled ? c.textMuted : v.text }]}>
            {label}
          </Text>
          {subtitle && <Text style={[styles.subtitle, { color: c.textMuted }]}>{subtitle}</Text>}
        </View>
      </View>
      {rightText && <Text style={[styles.rightText, { color: v.text }]}>{rightText}</Text>}
    </Pressable>
  );
}

export default React.memo(MenuButton);

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: Platform.OS === "web" ? 10 : 12,
    paddingVertical: Platform.OS === "web" ? 8 : 12,
    marginBottom: Platform.OS === "web" ? 5 : 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconWrap: {
    marginRight: Platform.OS === "web" ? 8 : 10,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: Platform.OS === "web" ? 13 : 14,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
    lineHeight: Platform.OS === "web" ? 15 : undefined,
  },
  rightText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    marginLeft: 8,
  },
});
