import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, Platform, useWindowDimensions } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { cursorPointer } from "@/hooks/useMouse";

type MenuItem = {
  label: string;
  action: string;
  icon?: string;
  danger?: boolean;
};

type Props = {
  visible: boolean;
  position: { x: number; y: number };
  items: MenuItem[];
  onSelect: (action: string) => void;
  onDismiss: () => void;
};

export default function ContextMenu({ visible, position, items, onSelect, onDismiss }: Props) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [menuSize, setMenuSize] = useState({ width: 0, height: 0 });
  const onMenuLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setMenuSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    }
  }, []);
  if (!visible || Platform.OS !== "web") return null;

  const edgePadding = 8;
  const estimatedWidth = 160;
  const estimatedHeight = Math.max(1, items.length) * 42 + 2;
  const menuWidth = menuSize.width || estimatedWidth;
  const menuHeight = menuSize.height || estimatedHeight;
  const left = Math.max(
    edgePadding,
    Math.min(position.x, viewportWidth - menuWidth - edgePadding),
  );
  const top = Math.max(
    edgePadding,
    Math.min(position.y, viewportHeight - menuHeight - edgePadding),
  );
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View
          testID="context-menu"
          onLayout={onMenuLayout}
          style={[styles.menu, { left, top }]}
        >
          {items.map((item, i) => (
            <Pressable
              key={item.action}
              onPress={() => onSelect(item.action)}
              style={({ pressed }) => [
                styles.menuItem,
                cursorPointer,
                pressed && { backgroundColor: Colors.bgElevated },
                i < items.length - 1 && styles.menuItemBorder,
              ]}
            >
              <Text style={[styles.menuText, item.danger && { color: Colors.danger }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 4,
    minWidth: 160,
    boxShadow: "0 4px 8px rgba(0,0,0,0.5)",
    elevation: 10,
    zIndex: 9999,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuText: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.3,
  },
}));
