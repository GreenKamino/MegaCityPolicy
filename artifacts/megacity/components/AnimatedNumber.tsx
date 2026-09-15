import React, { useEffect, useRef } from "react";
import { Animated, Text, type TextStyle, type StyleProp } from "react-native";
import { formatNumber } from "@/utils/format";

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
  format?: (n: number) => string;
  duration?: number;
};

function AnimatedNumber({ value, style, format, duration = 400 }: Props) {
  const animVal = useRef(new Animated.Value(value)).current;
  const displayRef = useRef(value);
  const [display, setDisplay] = React.useState(value);

  useEffect(() => {
    const target = value;
    Animated.timing(animVal, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start();

    const listener = animVal.addListener(({ value: v }) => {
      const rounded = Math.round(v);
      if (rounded !== displayRef.current) {
        displayRef.current = rounded;
        setDisplay(rounded);
      }
    });

    return () => {
      animVal.removeListener(listener);
    };
  }, [value, duration, animVal]);

  const formatted = format ? format(display) : formatNumber(display);

  return <Text style={style}>{formatted}</Text>;
}

export default React.memo(AnimatedNumber);
