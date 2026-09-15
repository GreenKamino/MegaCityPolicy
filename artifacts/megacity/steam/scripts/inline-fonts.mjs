#!/usr/bin/env node
// Inline the app's web fonts as base64 data-URI @font-face rules directly into
// web-build/index.html.
//
// WHY: The Steam desktop build is the Expo web export wrapped in Electron and
// served over a custom privileged "app://" scheme (see ../main.js). Chromium
// refuses to load fonts fetched via the FontFace API from a non-http(s) scheme,
// so expo-font's runtime loader silently fails: Inter falls back to a system
// font (looks off) and the icon fonts (Feather / MaterialCommunityIcons), which
// have no fallback glyphs, render completely BLANK — this is why the nav-bar
// tab icons disappeared on the PC build.
//
// Data: URIs are embedded in the document and never trigger a scheme-checked
// fetch, so they load on app:// exactly like on http. The exported web build
// (app/_layout.tsx) skips expo-font's loader on production web, leaving these
// inlined rules authoritative.
//
// This runs AFTER `expo export` (hashed asset filenames are resolved at build
// time) and is idempotent — re-running replaces the previously injected block.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webBuildDir = process.argv[2]
  ? process.argv[2]
  : join(__dirname, "..", "web-build");

const START = "<!-- inlined-fonts:start (steam/scripts/inline-fonts.mjs) -->";
const END = "<!-- inlined-fonts:end -->";

// family = the fontFamily string the app actually renders with.
//   - 'feather' / 'material-community' come from @expo/vector-icons'
//     createIconSet(glyphMap, '<family>', font) in build/{Feather,MCI}.js.
//   - the Inter_* names are the useFonts() keys referenced throughout styles.
const TARGETS = [
  { family: "feather", prefix: "Feather", weight: "400", required: true },
  { family: "material-community", prefix: "MaterialCommunityIcons", weight: "400", required: true },
  { family: "Inter_400Regular", prefix: "Inter_400Regular", weight: "400", required: false },
  { family: "Inter_500Medium", prefix: "Inter_500Medium", weight: "500", required: false },
  { family: "Inter_600SemiBold", prefix: "Inter_600SemiBold", weight: "600", required: false },
  { family: "Inter_700Bold", prefix: "Inter_700Bold", weight: "700", required: false },
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findFont(allFiles, prefix) {
  // Match e.g. "Feather.7b1f...ttf" or "Feather.ttf" (hashed or not).
  const matches = allFiles.filter((f) => {
    const b = basename(f);
    return b.toLowerCase().endsWith(".ttf") && b.startsWith(prefix + ".");
  });
  // Prefer the shortest path if multiple copies exist.
  matches.sort((a, b) => a.length - b.length);
  return matches[0];
}

function main() {
  const indexPath = join(webBuildDir, "index.html");
  let html;
  try {
    html = readFileSync(indexPath, "utf8");
  } catch {
    console.error(`[inline-fonts] ERROR: ${indexPath} not found.`);
    process.exit(1);
  }

  const allFiles = walk(join(webBuildDir, "assets"));
  const faces = [];
  const missing = [];

  for (const t of TARGETS) {
    const file = findFont(allFiles, t.prefix);
    if (!file) {
      if (t.required) missing.push(t.prefix);
      else console.warn(`[inline-fonts] note: optional font ${t.prefix}*.ttf not found, skipping.`);
      continue;
    }
    const b64 = readFileSync(file).toString("base64");
    faces.push(
      `@font-face{font-family:'${t.family}';font-style:normal;font-weight:${t.weight};` +
        `font-display:block;src:url(data:font/ttf;base64,${b64}) format('truetype');}`,
    );
    console.log(`[inline-fonts] inlined ${basename(file)} -> '${t.family}' (${(b64.length / 1024).toFixed(0)} KB b64)`);
  }

  if (missing.length) {
    console.error(`[inline-fonts] ERROR: required icon fonts not found: ${missing.join(", ")}`);
    console.error(`[inline-fonts] icons would render blank under app:// — aborting.`);
    process.exit(1);
  }

  const block = `${START}\n<style>\n${faces.join("\n")}\n</style>\n${END}`;

  // Remove any previously injected block, then inject before </head>.
  const between = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "g");
  html = html.replace(between, "");

  if (html.includes("</head>")) {
    html = html.replace("</head>", `${block}\n</head>`);
  } else {
    html = block + "\n" + html;
  }

  writeFileSync(indexPath, html, "utf8");
  console.log(`[inline-fonts] injected ${faces.length} @font-face rule(s) into ${indexPath}`);
}

main();
