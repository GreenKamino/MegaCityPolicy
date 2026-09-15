import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const contextPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../ThemeContext.tsx",
);
const source = readFileSync(contextPath, "utf8");

describe("theme default", () => {
  it("defaults new or unset preferences to the light palette", () => {
    expect(source).toContain('export const DEFAULT_THEME_MODE: ThemeMode = "light"');
    expect(source).toContain("const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE)");
    expect(source).toContain("mode: DEFAULT_THEME_MODE");
    expect(source).toContain("colors: LIGHT");
    expect(source).toContain("isDark: false");
  });

  it("continues restoring either explicit saved preference", () => {
    expect(source).toContain('stored === "light" || stored === "dark"');
    expect(source).toContain("setMode(stored)");
  });
});