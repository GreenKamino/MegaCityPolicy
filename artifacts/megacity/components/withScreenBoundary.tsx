import React, { useEffect, useState } from "react";
import { router, useNavigation } from "expo-router";
import { Freeze } from "react-freeze";

import GameErrorBoundary from "./GameErrorBoundary";

// The game keeps every visited tab screen mounted (lazy screen cache), so on
// long sessions dozens of screens end up subscribed to GameContext and
// re-rendering on every tick. That compounding render load eventually makes
// screen switches stutter and flicker until the player backs out to the main
// menu (which unmounts everything). Freezing blurred screens defers their
// renders until they regain focus, so only the visible screen pays the
// per-tick render cost. react-navigation's freezeOnBlur option is a no-op on
// web (react-native-screens falls back to plain Views), so we freeze here
// with react-freeze directly, uniformly across platforms.
function useScreenFocused(): boolean {
  const navigation = useNavigation();
  const [focused, setFocused] = useState(() => navigation.isFocused());
  useEffect(() => {
    const subFocus = navigation.addListener("focus", () => setFocused(true));
    const subBlur = navigation.addListener("blur", () => setFocused(false));
    setFocused(navigation.isFocused());
    return () => {
      subFocus();
      subBlur();
    };
  }, [navigation]);
  return focused;
}

export function withScreenBoundary<P extends object>(
  Component: React.ComponentType<P>,
  screenName: string,
): React.ComponentType<P> {
  const Wrapped: React.FC<P> = (props) => {
    const focused = useScreenFocused();
    const onReturn =
      screenName === "overview"
        ? undefined
        : () => router.replace("/(game)/overview" as never);
    return (
      <GameErrorBoundary screenName={screenName} onReturn={onReturn}>
        <Freeze freeze={!focused}>
          <Component {...props} />
        </Freeze>
      </GameErrorBoundary>
    );
  };
  Wrapped.displayName = `withScreenBoundary(${screenName})`;
  return Wrapped;
}
