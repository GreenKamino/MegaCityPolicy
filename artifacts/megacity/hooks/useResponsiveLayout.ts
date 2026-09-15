import { Platform, useWindowDimensions } from "react-native";

export type ResponsiveLayout = {
  width: number;
  height: number;
  isWeb: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWideDesktop: boolean;
};

export const RESPONSIVE_BREAKPOINTS = {
  tablet: 600,
  desktop: 800,
  wideDesktop: 1024,
} as const;

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isTablet = width >= RESPONSIVE_BREAKPOINTS.tablet;
  const isDesktop = isWeb && width >= RESPONSIVE_BREAKPOINTS.desktop;
  const isWideDesktop = isWeb && width >= RESPONSIVE_BREAKPOINTS.wideDesktop;
  const isPhone = !isTablet;

  return { width, height, isWeb, isPhone, isTablet, isDesktop, isWideDesktop };
}
