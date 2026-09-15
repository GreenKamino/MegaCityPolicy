import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";

import type { HapticIntensity } from "@/engine/haptics";

export type ModalButton = {
  text: string;
  onPress?: () => void;
  haptic?: HapticIntensity;
  style?: "default" | "cancel" | "destructive";
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: ModalButton[];
  onDismiss?: () => void;
  children?: React.ReactNode;
};

export default function GameModal({ visible, title, message, buttons, onDismiss, children }: Props) {
  const { colors } = useTheme();
  const prevVisible = useRef(false);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      playSound("modal_open");
      playHaptic("light");
    }
    if (!visible && prevVisible.current) {
      playSound("modal_close");
      playHaptic("light");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleDismiss = useCallback(() => {
    playSound("modal_close");
    playHaptic("light");
    if (onDismiss) onDismiss();
  }, [onDismiss]);

  // React Native's Modal maps Escape to onRequestClose on native platforms,
  // but React Native Web does not consistently do that. Keep the same
  // dismissal contract on desktop/web so validation and error dialogs can
  // never trap keyboard users.
  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, handleDismiss]);

  const handleButtonPress = (btn: ModalButton) => {
    playSound(btn.style === "destructive" ? "error" : btn.style === "cancel" ? "modal_close" : "ui_tap");
    playHaptic(btn.haptic ?? (btn.style === "destructive" ? "error" : "light"));
    if (onDismiss) onDismiss();
    if (btn.onPress) {
      setTimeout(() => btn.onPress!(), 50);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable
          style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.accent }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.accent }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: colors.text }]}>{message}</Text> : null}
          {children}
          <ScrollView style={styles.buttonScroll} contentContainerStyle={styles.buttonContainer}>
            {buttons.map((btn, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.button,
                  btn.style === "destructive" && { backgroundColor: colors.danger, borderColor: colors.danger },
                  btn.style === "cancel" && { backgroundColor: "transparent", borderColor: colors.border },
                  btn.style !== "cancel" && btn.style !== "destructive" && { backgroundColor: colors.accent, borderColor: colors.accent },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleButtonPress(btn)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: colors.bg },
                    btn.style === "destructive" && { color: "#fff" },
                    btn.style === "cancel" && { color: colors.textMuted },
                  ]}
                >
                  {btn.text}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: Platform.OS === "web" ? "flex-start" : "center",
    alignItems: "center",
    paddingHorizontal: Platform.OS === "web" ? 16 : 30,
    paddingTop: Platform.OS === "web" ? 16 : 30,
    paddingBottom: Platform.OS === "web" ? 12 : 30,
  },
  container: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Platform.OS === "web" ? 14 : 20,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 560 : 400,
    maxHeight: Platform.OS === "web" ? "95%" : "80%",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.2,
    marginBottom: Platform.OS === "web" ? 7 : 10,
    textAlign: Platform.OS === "web" ? "left" : "center",
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: Platform.OS === "web" ? 18 : 20,
    marginBottom: Platform.OS === "web" ? 10 : 16,
    textAlign: Platform.OS === "web" ? "left" : "center",
  },
  buttonScroll: {
    maxHeight: Platform.OS === "web" ? 420 : 250,
  },
  buttonContainer: {
    gap: Platform.OS === "web" ? 5 : 8,
  },
  button: {
    paddingVertical: Platform.OS === "web" ? 9 : 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
});
