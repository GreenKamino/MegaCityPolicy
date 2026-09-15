import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

function SearchBar({ value, onChangeText, placeholder = "SEARCH..." }: Props) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  const handleClear = useCallback(() => {
    onChangeText("");
  }, [onChangeText]);

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      <Text style={styles.icon}>&#x2315;</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        accessibilityLabel={placeholder ?? "Search"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
          <Text style={styles.clearText}>&#x2715;</Text>
        </Pressable>
      )}
    </View>
  );
}

export default React.memo(SearchBar);

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 255, 65, 0.04)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  containerFocused: {
    borderColor: Colors.accentDim,
  },
  icon: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    letterSpacing: 1,
    padding: 0,
    outlineStyle: "none" as any,
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
}));
