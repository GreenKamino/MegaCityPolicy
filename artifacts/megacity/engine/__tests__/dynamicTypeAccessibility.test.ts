import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function collectTsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("Dynamic Type accessibility", () => {
  it("requires an accessible name whenever a Pressable declares interactive semantics", () => {
    const files = [
      path.join(projectRoot, "app/index.tsx"),
      ...collectTsxFiles(path.join(projectRoot, "app/(game)")),
      ...collectTsxFiles(path.join(projectRoot, "components")),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/<Pressable\b([\s\S]*?)>/g)) {
        const openingTag = match[1];
        if (
          /accessibilityRole\s*=\s*["'](?:button|checkbox|combobox|menuitem|radio|switch|tab)["']/.test(openingTag) &&
          !/\baccessibilityLabel\s*=/.test(openingTag) &&
          !/\baria-label\s*=/.test(openingTag)
        ) {
          const line = source.slice(0, match.index).split("\n").length;
          offenders.push(`${path.relative(projectRoot, file)}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not opt game or shared UI text out of system font scaling", () => {
    const files = [
      path.join(projectRoot, "app/index.tsx"),
      ...collectTsxFiles(path.join(projectRoot, "app/(game)")),
      ...collectTsxFiles(path.join(projectRoot, "components")),
    ];

    const offenders = files
      .filter((file) => /allowFontScaling\s*=\s*(?:\{\s*false\s*\}|["']false["'])/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(projectRoot, file));

    expect(offenders).toEqual([]);
  });

  it("keeps critical accessibility-size layouts able to reflow", () => {
    const expectations: Array<[string, RegExp[]]> = [
      ["app/(game)/overview.tsx", [/header:\s*\{[\s\S]*?flexWrap:\s*"wrap"/, /banner:\s*\{[\s\S]*?flexWrap:\s*"wrap"/]],
      ["app/(game)/districts.tsx", [/detailStatsRow:\s*\{[\s\S]*?flexWrap:\s*"wrap"/, /detailModal:\s*\{[\s\S]*?maxHeight:\s*"90%"/]],
      ["app/(game)/diplomacy.tsx", [/factionHeader:\s*\{[^}]*flexWrap:\s*"wrap"/, /tabScroller:\s*\{[\s\S]*?minHeight:\s*52/, /tabBtn:\s*\{[\s\S]*?minWidth:\s*120/]],
      ["app/(game)/worldmap.tsx", [/headerRow:\s*\{[\s\S]*?flexWrap:\s*"wrap"/, /infoPanelHeader:\s*\{[\s\S]*?flexWrap:\s*"wrap"/]],
      ["app/index.tsx", [/modalHeader:\s*\{[\s\S]*?flexWrap:\s*"wrap"/, /attrRow:\s*\{[^}]*flexWrap:\s*"wrap"/]],
    ];

    for (const [relativePath, patterns] of expectations) {
      const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
      for (const pattern of patterns) expect(source, relativePath).toMatch(pattern);
    }
  });
});