import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Regression guard for the light-mode migration: every UI file must read the
// palette from useTheme() (context/ThemeContext), never from the static dark
// palette module. The ONLY allowed importer of @/constants/colors in UI land
// is ThemeContext.tsx itself, which builds the live palettes from it.
//
// If this test fails, the offending file was added or edited to import the
// static palette. Migrate it: use `const { colors: Colors } = useTheme()` for
// JSX and `makeThemedStyles((Colors: ThemePalette) => StyleSheet.create(...))`
// for module-scope styles (see app/(game)/trade.tsx for the pattern).

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "context", "hooks"];
const ALLOWED = new Set([path.join("context", "ThemeContext.tsx")]);
const IMPORT_RE = /from\s+["']@\/constants\/colors["']|require\(["']@\/constants\/colors["']\)/;

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("no static palette imports in UI code", () => {
  it("app/, components/, context/, hooks/ do not import @/constants/colors", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) continue;
      for (const file of collectFiles(abs)) {
        const rel = path.relative(ROOT, file);
        if (ALLOWED.has(rel)) continue;
        const src = fs.readFileSync(file, "utf8");
        if (IMPORT_RE.test(src)) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `These UI files import the static dark palette instead of useTheme(): ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
