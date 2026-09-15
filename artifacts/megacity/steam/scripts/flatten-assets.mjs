#!/usr/bin/env node
// Flatten the deep `assets/__node_modules/.pnpm/.../node_modules/.../<file>`
// asset tree that `expo export --platform web` emits into a short
// `assets/v/<basename>` directory, and rewrite the literal asset URLs in the
// bundle's entry JS to match.
//
// WHY: pnpm's content-addressed layout produces internal asset paths up to
// ~309 characters (e.g. @expo/vector-icons font families and a few
// @react-navigation / expo-router PNGs). Windows refuses paths >= 260 chars
// (MAX_PATH), so the Steam desktop zip extracts fine on Linux but fails on the
// player's Windows machine with PathTooLongException. Shortening the paths in
// the build is the only durable fix (a shorter base folder cannot rescue a
// path that is already 309 chars at zero base).
//
// These deep files are referenced as LITERAL absolute URLs
// (`/assets/__node_modules/.pnpm/.../<basename>`) in EXACTLY ONE place: the
// `_expo/static/js/web/entry-<hash>.js` bundle. Moving each file to
// `assets/v/<basename>` (the basename already carries a content hash) and
// string-replacing the URL keeps every reference resolvable. Served through the
// `app://` protocol handler (see ../main.js) the short URLs resolve identically.
//
// Run this AFTER `expo export` AND AFTER inline-fonts.mjs (which reads the
// un-flattened __node_modules font tree to inline the icon TTFs into
// index.html). Idempotent: a second run finds no __node_modules tree and no-ops.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  renameSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webBuildDir = process.argv[2]
  ? process.argv[2]
  : join(__dirname, "..", "web-build");

const deepRoot = join(webBuildDir, "assets", "__node_modules");
if (!existsSync(deepRoot)) {
  console.log("[flatten-assets] no assets/__node_modules tree — nothing to do.");
  process.exit(0);
}

// Locate the entry bundle that holds the literal asset URLs.
const jsDir = join(webBuildDir, "_expo", "static", "js", "web");
const entryFile = readdirSync(jsDir).find(
  (f) => f.startsWith("entry-") && f.endsWith(".js"),
);
if (!entryFile) {
  console.error("[flatten-assets] could not find entry-*.js in", jsDir);
  process.exit(1);
}
const entryPath = join(jsDir, entryFile);
let js = readFileSync(entryPath, "utf8");

// Find every distinct /assets/__node_modules/... URL referenced by the bundle.
const urlRe = /\/assets\/__node_modules\/[^"'`\s\\)]+/g;
const urls = Array.from(new Set(js.match(urlRe) || []));
if (urls.length === 0) {
  console.warn(
    "[flatten-assets] __node_modules tree exists but no URL refs in entry JS; deleting tree only.",
  );
}

const shortDir = join(webBuildDir, "assets", "v");
mkdirSync(shortDir, { recursive: true });

const used = new Map(); // basename -> source url (collision guard)
let moved = 0;
for (const url of urls) {
  const srcRel = url.replace(/^\//, ""); // assets/__node_modules/...
  const srcAbs = join(webBuildDir, srcRel);
  const base = basename(url);
  if (used.has(base) && used.get(base) !== url) {
    console.error(
      `[flatten-assets] basename collision for ${base}:\n  ${used.get(base)}\n  ${url}`,
    );
    process.exit(1);
  }
  used.set(base, url);
  const destAbs = join(shortDir, base);
  if (!existsSync(srcAbs)) {
    // Already moved on a prior partial run; just rewrite the URL.
    if (!existsSync(destAbs)) {
      console.error(`[flatten-assets] missing source asset: ${srcAbs}`);
      process.exit(1);
    }
  } else if (!existsSync(destAbs)) {
    renameSync(srcAbs, destAbs);
    moved++;
  }
  js = js.split(url).join(`/assets/v/${base}`);
}

writeFileSync(entryPath, js);

// Drop the now-unreferenced deep tree entirely.
rmSync(deepRoot, { recursive: true, force: true });

// Verify nothing still points at __node_modules and every /assets/v/ resolves.
const leftover = (js.match(/__node_modules/g) || []).length;
if (leftover) {
  console.error(`[flatten-assets] ${leftover} __node_modules refs still remain!`);
  process.exit(1);
}
for (const base of used.keys()) {
  const p = join(shortDir, base);
  if (!existsSync(p) || !statSync(p).isFile()) {
    console.error(`[flatten-assets] /assets/v/${base} did not resolve to a file`);
    process.exit(1);
  }
}

console.log(
  `[flatten-assets] flattened ${moved} asset(s) into assets/v/, rewrote ${urls.length} URL(s) in ${entryFile}, removed assets/__node_modules.`,
);
