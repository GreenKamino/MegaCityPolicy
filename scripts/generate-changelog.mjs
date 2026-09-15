#!/usr/bin/env node
// Regenerates artifacts/megacity/data/changelog.ts from the canonical
// CHANGELOG.md at the repo root. Idempotent — re-running with no markdown
// changes produces the same file.
//
// Run: `pnpm --filter @workspace/megacity run changelog`
//   or `node scripts/generate-changelog.mjs`

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const SOURCE = join(ROOT, "CHANGELOG.md");
const DEST = join(ROOT, "artifacts/megacity/data/changelog.ts");

const VALID_HEADINGS = new Set(["Added", "Changed", "Fixed", "Removed", "Notes"]);

function parseChangelog(md) {
  const entries = [];
  const lines = md.split(/\r?\n/);

  let current = null;
  let currentSection = null;

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s+[—-]\s+(\d{4}-\d{2}-\d{2})(?:\s+[—-]\s+(.+))?$/);
    if (versionMatch) {
      if (current) entries.push(current);
      current = {
        version: versionMatch[1].trim(),
        date: versionMatch[2].trim(),
        title: (versionMatch[3] ?? "").trim(),
        sections: [],
      };
      currentSection = null;
      continue;
    }

    const sectionMatch = line.match(/^###\s+(.+?)\s*$/);
    if (sectionMatch && current) {
      const heading = sectionMatch[1].trim();
      if (!VALID_HEADINGS.has(heading)) {
        throw new Error(
          `Unknown section heading "${heading}" in version ${current.version}. ` +
            `Allowed: ${[...VALID_HEADINGS].join(", ")}.`,
        );
      }
      currentSection = { heading, items: [] };
      current.sections.push(currentSection);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch && currentSection) {
      const text = stripMarkdownEmphasis(bulletMatch[1].trim());
      currentSection.items.push(text);
      continue;
    }

    const continuationMatch = line.match(/^\s{2,}(\S.*)$/);
    if (continuationMatch && currentSection && currentSection.items.length > 0) {
      const last = currentSection.items.length - 1;
      currentSection.items[last] = `${currentSection.items[last]} ${stripMarkdownEmphasis(continuationMatch[1].trim())}`;
    }
  }
  if (current) entries.push(current);
  return entries;
}

// Drop markdown bold/italic/code markers from bullet text so the in-game UI
// receives plain strings. The patch-notes UI is not a markdown renderer.
function stripMarkdownEmphasis(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function escapeForTs(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderTs(entries) {
  const head = [
    "// AUTO-GENERATED FROM /CHANGELOG.md — DO NOT EDIT BY HAND.",
    "// Run `pnpm --filter @workspace/megacity run changelog` to regenerate.",
    "",
    "export type ChangelogSection = {",
    '  heading: "Added" | "Changed" | "Fixed" | "Removed" | "Notes";',
    "  items: string[];",
    "};",
    "",
    "export type ChangelogEntry = {",
    "  version: string;",
    "  date: string;",
    "  title: string;",
    "  sections: ChangelogSection[];",
    "};",
    "",
    "export const CHANGELOG: ChangelogEntry[] = [",
  ];

  const body = entries.map((entry) => {
    const sectionLines = entry.sections.map((section) => {
      const itemLines = section.items.map((item) => `      "${escapeForTs(item)}",`).join("\n");
      return [
        "    {",
        `      heading: "${section.heading}",`,
        "      items: [",
        itemLines,
        "      ],",
        "    },",
      ].join("\n");
    }).join("\n");
    return [
      "  {",
      `    version: "${escapeForTs(entry.version)}",`,
      `    date: "${escapeForTs(entry.date)}",`,
      `    title: "${escapeForTs(entry.title)}",`,
      "    sections: [",
      sectionLines,
      "    ],",
      "  },",
    ].join("\n");
  }).join("\n");

  return `${head.join("\n")}\n${body}\n];\n`;
}

function main() {
  const md = readFileSync(SOURCE, "utf8");
  const entries = parseChangelog(md);
  if (entries.length === 0) {
    throw new Error(`No changelog entries parsed from ${SOURCE}.`);
  }
  const ts = renderTs(entries);

  let existing = "";
  try {
    existing = readFileSync(DEST, "utf8");
  } catch {
    existing = "";
  }
  if (existing === ts) {
    process.stdout.write(`changelog: no changes (${entries.length} entries).\n`);
    return;
  }
  writeFileSync(DEST, ts);
  process.stdout.write(`changelog: wrote ${entries.length} entries to ${DEST}.\n`);
}

main();
