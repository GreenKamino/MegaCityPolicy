import React from "react";

import LoadingScreen from "@/components/LoadingScreen";

// In-game Suspense fallback shown during screen transitions. It reuses the
// minimal boot screen (LoadingScreen) so loading looks consistent everywhere —
// a dark field with a slowly sweeping radar and a "LOADING" readout. No progress
// bar here (transitions have no real milestones to track), so it reads as a
// plain animated splash that reassures the player the game is still working.
function ScreenLoader() {
  return <LoadingScreen />;
}

export default React.memo(ScreenLoader);
