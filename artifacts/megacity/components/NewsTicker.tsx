import React, { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

type Props = {
  headlines: string[];
};

const SEPARATOR = "  \u25C6  ";
const SCROLL_SPEED = 30;

function NewsTicker({ headlines }: Props) {
  const { colors } = useTheme();
  const scrollX = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const joined = headlines.length > 0
    ? headlines.join(SEPARATOR) + SEPARATOR
    : "NO LIVE STATUS DATA" + SEPARATOR;

  const displayText = joined + joined;
  const accessibleText = headlines.length > 0
    ? headlines.join(" • ")
    : "NO LIVE STATUS DATA";

  const onContainerLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const onTextLayout = (e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width);
  };

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.2, duration: 1200, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 1200, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [dotOpacity]);

  useEffect(() => {
    if (containerWidth === 0 || textWidth === 0) return;

    const halfWidth = textWidth / 2;
    if (halfWidth <= 0) return;

    const duration = (halfWidth / SCROLL_SPEED) * 1000;

    scrollX.setValue(containerWidth);

    const anim = Animated.loop(
      Animated.timing(scrollX, {
        toValue: containerWidth - halfWidth,
        duration,
        useNativeDriver: USE_NATIVE_DRIVER,
        isInteraction: false,
      })
    );

    animRef.current = anim;
    anim.start();

    return () => {
      anim.stop();
      animRef.current = null;
    };
  }, [containerWidth, textWidth, joined, scrollX]);

  return (
    <View
      testID="news-ticker"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Live operations ticker: ${accessibleText}`}
      style={[styles.container, {
        backgroundColor: colors.accent + "08",
        borderColor: colors.accent + "18",
      }]}
    >
      <View style={[styles.prefixBox, { borderRightColor: colors.accent + "30", backgroundColor: colors.accent + "0C" }]}>
        <Animated.View style={[styles.liveDot, { backgroundColor: "#FF3333", opacity: dotOpacity }]} />
        <Text style={[styles.prefix, { color: colors.accent }]}>LIVE</Text>
      </View>
      <View style={styles.tickerWrap} onLayout={onContainerLayout}>
        <Animated.View style={[styles.scrollContent, { transform: [{ translateX: scrollX }] }]}>
          <Text
            style={[styles.headline, { color: colors.textSecondary }]}
            numberOfLines={1}
            onLayout={onTextLayout}
          >
            {displayText}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

export default React.memo(NewsTicker);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    height: 28,
    overflow: "hidden",
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderRightWidth: 1,
    height: "100%",
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  prefix: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 2,
  },
  tickerWrap: {
    flex: 1,
    overflow: "hidden",
    height: "100%",
    justifyContent: "center",
  },
  scrollContent: {
    flexDirection: "row",
    position: "absolute",
  },
  headline: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
