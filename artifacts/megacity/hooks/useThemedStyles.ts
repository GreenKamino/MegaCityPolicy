import { useTheme, type ThemePalette } from "@/context/ThemeContext";

/**
 * Wrap a StyleSheet factory so styles are rebuilt only when the theme
 * palette changes. The palette object from ThemeContext is memoized, so
 * a WeakMap keyed on it gives one styles object per palette per file,
 * shared across every component instance in that file.
 *
 * Usage:
 *   const useStyles = makeThemedStyles((Colors) => StyleSheet.create({ ... }));
 *   // inside each component:
 *   const styles = useStyles();
 */
export function makeThemedStyles<T>(factory: (Colors: ThemePalette) => T): () => T {
  const cache = new WeakMap<ThemePalette, T>();
  return function useThemedStyles(): T {
    const { colors } = useTheme();
    let styles = cache.get(colors);
    if (styles === undefined) {
      styles = factory(colors);
      cache.set(colors, styles);
    }
    return styles;
  };
}
