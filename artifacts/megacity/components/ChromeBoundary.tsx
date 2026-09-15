import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ThemeContext, type ThemePalette } from "@/context/ThemeContext";

type Props = {
  children: React.ReactNode;
  region: string;
};

type State = { hasError: boolean };

export class ChromeBoundary extends React.Component<Props, State> {
  static contextType = ThemeContext;
  // NOTE: no `declare context:` class field here — Metro's babel
  // flow-strip-types pass rejects the `declare` modifier. The context is
  // typed at the read site instead.
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: { componentStack: string }): void {
    // Chrome failures are non-fatal — the active screen and the rest of the
    // chrome continue to function. Logging only; no panic save needed since
    // the simulation isn't impacted.
  }

  render() {
    if (this.state.hasError) {
      const styles = createStyles(
        (this.context as React.ContextType<typeof ThemeContext>).colors,
      );
      return (
        <View style={styles.strip} accessibilityRole="alert">
          <Text style={styles.label}>// MODULE OFFLINE: {this.props.region.toUpperCase()}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default ChromeBoundary;

const createStyles = (Colors: ThemePalette) => StyleSheet.create({
  strip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.danger + "55",
    borderTopWidth: 1,
    borderTopColor: Colors.danger + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.danger,
    letterSpacing: 1,
  },
});
