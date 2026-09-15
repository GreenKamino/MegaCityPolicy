import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ThemeContext, type ThemePalette } from "@/context/ThemeContext";
import {
  CrashReport,
  formatCrashReport,
  recordCrashReport,
} from "@/engine/crashReports";
import { triggerPanicSave } from "@/engine/panicSave";

type Props = {
  children: React.ReactNode;
  screenName?: string;
  onReturn?: () => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
  report: CrashReport | null;
  copyStatus: "idle" | "copied" | "failed";
};

function getAppVersion(): string {
  const v = Constants.expoConfig?.version as string | undefined;
  return v ?? "unknown";
}

class GameErrorBoundary extends React.Component<Props, State> {
  static contextType = ThemeContext;
  // NOTE: no `declare context:` class field here — Metro's babel
  // flow-strip-types pass rejects the `declare` modifier. The context is
  // typed at the read site instead.
  state: State = {
    hasError: false,
    error: null,
    report: null,
    copyStatus: "idle",
  };
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // Snapshot the in-memory state to a recovery slot before the user sees
    // the malfunction screen. Fire-and-forget; self-throttled.
    triggerPanicSave();
    const report: CrashReport = {
      timestamp: Date.now(),
      screenName: this.props.screenName ?? "unknown",
      message: error?.message ?? "Unknown error",
      componentStack: info?.componentStack ?? "",
      appVersion: getAppVersion(),
    };
    recordCrashReport(report);
    this.setState({ report });
  }

  componentWillUnmount(): void {
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      report: null,
      copyStatus: "idle",
    });
  };

  handleCopyDiagnostics = async () => {
    const report = this.state.report;
    if (!report) return;
    try {
      await Clipboard.setStringAsync(formatCrashReport(report));
      this.setState({ copyStatus: "copied" });
    } catch {
      this.setState({ copyStatus: "failed" });
    }
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      this.setState({ copyStatus: "idle" });
    }, 2500);
  };

  render() {
    if (this.state.hasError) {
      const styles = createStyles(
        (this.context as React.ContextType<typeof ThemeContext>).colors,
      );
      const { copyStatus } = this.state;
      const toastText =
        copyStatus === "copied"
          ? "// CRASH REPORT COPIED TO CLIPBOARD"
          : copyStatus === "failed"
            ? "// CLIPBOARD DENIED — VIEW REPORT IN DEBUG SCREEN"
            : null;
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠</Text>
          <Text style={styles.title}>SYSTEM MALFUNCTION</Text>
          <Text style={styles.subtitle}>
            {this.props.screenName
              ? `// ${this.props.screenName.toUpperCase()} MODULE OFFLINE`
              : "// MODULE OFFLINE"}
          </Text>
          <Text style={styles.errorText}>
            {this.state.error?.message ?? "Unknown error"}
          </Text>
          <View style={styles.actionRow}>
            <Pressable onPress={this.handleRetry} style={styles.retryBtn}>
              <Text style={styles.retryText}>[ RETRY ]</Text>
            </Pressable>
            {this.props.onReturn && (
              <Pressable
                onPress={() => {
                  this.setState({
                    hasError: false,
                    error: null,
                    report: null,
                    copyStatus: "idle",
                  });
                  this.props.onReturn?.();
                }}
                style={styles.retryBtn}
                accessibilityRole="button"
                accessibilityLabel="Back to overview"
              >
                <Text style={styles.retryText}>[ BACK TO OVERVIEW ]</Text>
              </Pressable>
            )}
            <Pressable
              onPress={this.handleCopyDiagnostics}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Copy crash diagnostics to clipboard"
            >
              <Text style={styles.retryText}>[ COPY DIAGNOSTICS ]</Text>
            </Pressable>
          </View>
          {toastText && (
            <Text
              style={[
                styles.toast,
                copyStatus === "failed" && styles.toastFailed,
              ]}
              accessibilityLiveRegion="polite"
            >
              {toastText}
            </Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

export default GameErrorBoundary;

const createStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.danger,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 300,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.accent,
    letterSpacing: 1,
  },
  toast: {
    marginTop: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 1,
    textAlign: "center",
  },
  toastFailed: {
    color: Colors.warning,
  },
});

