import { Platform } from "react-native";

/**
 * Shared spacing standards for the command interface.
 *
 * Desktop/web uses the compact set to expose more operational information
 * above the fold. Native keeps the larger set so touch targets and phone
 * readability do not regress.
 */
export const GAME_DENSITY = {
  web: {
    screenGutter: 12,
    screenTop: 8,
    screenBottom: 16,
    cardPadding: 10,
    sectionGap: 10,
    headerVertical: 4,
    tabVertical: 5,
  },
  native: {
    screenGutter: 16,
    screenTop: 12,
    screenBottom: 20,
    cardPadding: 12,
    sectionGap: 12,
    headerVertical: 8,
    tabVertical: 8,
  },
} as const;

export const ACTIVE_GAME_DENSITY = Platform.OS === "web" ? GAME_DENSITY.web : GAME_DENSITY.native;