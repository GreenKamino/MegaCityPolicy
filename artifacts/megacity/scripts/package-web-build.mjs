#!/usr/bin/env node
// MEGACITY web-build handoff packager.
//
// Produces ONE self-describing file — dist-download/web-build.zip — that hands the
// game's exported web build to the SEPARATE Steam/desktop packaging project.
//
//   pnpm --filter @workspace/megacity run handoff
//
// What it does:
//   1. Exports the game's web build with a plain `expo export` (root-absolute paths,
//      no Replit proxy / BASE_PATH injection — exactly what a desktop wrapper needs).
//      Pass --skip-build --from <dir> to package an existing build instead of exporting.
//   2. Stages that build plus two marker files that announce the bundle as a read-only
//      INPUT for the packaging project (not source to edit): READ_ME_FIRST.txt and
//      BUILD_INFO.json (game name, version, build date, provenance, purpose flags).
//   3. Zips it all into dist-download/web-build.zip.
//   4. Verifies the bundle unpacks into the structure the packaging project expects.
//
// NOTE: a plain `expo export` takes a few minutes and clashes with the running Metro
// dev server. Stop the "megacity: expo" dev workflow before running a fresh export.

import { spawnSync } from "node:child_process";
import {
  existsSync, rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, statSync,
  readdirSync,
} from "node:fs";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(HERE, "..");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => {
  const i = args.indexOf(f);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

const SKIP_BUILD = has("--skip-build");
const FROM = valOf("--from"); // existing build dir to package as-is
const madeFreshBuild = !FROM && !SKIP_BUILD;
const STAGE = join(PROJECT_DIR, ".handoff-stage");
const FRESH_BUILD = join(PROJECT_DIR, ".handoff-build");
const OUT_DIR = join(PROJECT_DIR, "dist-download");
const OUT_ZIP = valOf("--out") || join(OUT_DIR, "web-build.zip");

const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, "package.json"), "utf8"));
const GAME_NAME = "MEGACITY: Sector Marshal";

function run(cmd, cmdArgs, opts = {}) {
  console.log(`==> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, {
    stdio: "inherit", cwd: PROJECT_DIR, shell: process.platform === "win32", ...opts,
  });
  if (r.status !== 0) {
    console.error(`ERROR: command failed with exit code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

function gitShortSha() {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: PROJECT_DIR, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function verifyReleaseSmokeFixture(buildDir) {
  const entryDir = join(buildDir, "_expo", "static", "js", "web");
  const entryFiles = existsSync(entryDir)
    ? readdirSync(entryDir).filter((name) => /^entry-.*\.js$/.test(name))
    : [];
  const bundleText = entryFiles
    .map((name) => readFileSync(join(entryDir, name), "utf8"))
    .join("\n");
  const requiredMarkers = [
    "boundarycomms",
    "COMMUNICATIONS STRENGTH",
    "No low-signal corruption penalty at 30% or higher.",
  ];
  const missingMarkers = requiredMarkers.filter((marker) => !bundleText.includes(marker));
  if (missingMarkers.length) {
    console.error(
      `ERROR: release communications smoke fixture is missing from the exported entry bundle: ${missingMarkers.join(", ")}`,
    );
    process.exit(1);
  }
  console.log(
    `Release smoke fixture verified in ${entryFiles.length} entry bundle(s): exact-30% communications boundary`,
  );
}

// 1) Decide the source build directory ------------------------------------------------
let buildDir;
if (FROM) {
  buildDir = resolve(PROJECT_DIR, FROM);
  if (!existsSync(join(buildDir, "index.html"))) {
    console.error(`ERROR: --from ${buildDir} has no index.html.`);
    process.exit(1);
  }
  console.log(`Using existing build at ${relative(PROJECT_DIR, buildDir)}/`);
} else if (SKIP_BUILD) {
  console.error("ERROR: --skip-build requires --from <build-dir>.");
  process.exit(1);
} else {
  console.log("Exporting the game's web build (this takes a few minutes)...");
  console.log("(If this hangs or errors, stop the 'megacity: expo' dev workflow first.)\n");
  rmSync(FRESH_BUILD, { recursive: true, force: true });
  run("pnpm", ["exec", "expo", "export", "--platform", "web", "--output-dir", ".handoff-build"]);
  buildDir = FRESH_BUILD;
  if (!existsSync(join(buildDir, "index.html"))) {
    console.error("ERROR: export produced no index.html.");
    process.exit(1);
  }
}
verifyReleaseSmokeFixture(buildDir);

// 2) Stage the build + marker files ---------------------------------------------------
console.log(`\nStaging bundle in ${relative(PROJECT_DIR, STAGE)}/ ...`);
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
cpSync(buildDir, STAGE, { recursive: true });

const buildDate = new Date().toISOString();
const sha = gitShortSha();

const buildInfo = {
  game: GAME_NAME,
  package: pkg.name,
  version: pkg.version,
  buildDate,
  sourceCommit: sha,
  sourceProject: "MEGACITY Replit project (artifacts/megacity)",
  purpose: "packaging-input",
  editable: false,
  contents:
    "Static web build of the game (index.html + assets/ + _expo/). Place these contents " +
    "wholesale into the packaging project's web-build/ directory.",
  howToUse:
    "Replace the packaging project's web-build/ contents entirely with everything in this " +
    "bundle EXCEPT READ_ME_FIRST.txt and BUILD_INFO.json. Do not hand-edit any file. To " +
    "update later, replace the whole bundle again.",
};
writeFileSync(join(STAGE, "BUILD_INFO.json"), JSON.stringify(buildInfo, null, 2) + "\n");

const readme = `MEGACITY — WEB BUILD HANDOFF  (READ ME FIRST)
==================================================================

WHAT THIS IS
  This bundle is the exported WEB BUILD of the game "${GAME_NAME}".
  It is provided to the desktop/Steam packaging project as an INPUT —
  it is the finished game to wrap, NOT source code to edit.

  Game version : ${pkg.version}
  Built on     : ${buildDate}
  From commit  : ${sha}
  Source       : MEGACITY Replit project (artifacts/megacity)

HOW TO USE IT (packaging project)
  1. Unzip this file.
  2. Take everything EXCEPT this README and BUILD_INFO.json
     (i.e. index.html, assets/, _expo/, and the other top-level files)
     and drop them into the packaging project's  web-build/  folder,
     REPLACING its previous contents WHOLESALE.
  3. Do NOT hand-edit any of these files. They are generated output.
  4. Run your normal desktop/Steam packaging (Electron or Tauri) as usual.
  5. To update to a newer game version later, just replace the whole bundle again.

  BUILD_INFO.json carries the same facts in machine-readable form
  (purpose: "packaging-input", editable: false) so your tooling can log
  exactly which version it is wrapping.

IMPORTANT — WINDOWS LONG-PATH NOTE (for whoever packages a Windows build)
  This build contains a few deeply nested icon-font / image asset paths
  (under assets/__node_modules/.pnpm/...), some over 300 characters long.
  Linux/macOS unzip these fine. Windows refuses paths >= 260 characters,
  so extracting on Windows (or building a Windows desktop binary that
  copies these paths) can fail with "path too long".
  The packaging project should shorten these before producing a Windows
  build (e.g. relocate the deep assets/__node_modules/... files into a
  short folder and update their references in
  _expo/static/js/web/entry-*.js, where they appear as literal URLs).

This file and BUILD_INFO.json are markers only — they are NOT part of the game.
`;
writeFileSync(join(STAGE, "READ_ME_FIRST.txt"), readme);

// 3) Zip the staging dir (no JS zip lib available; use Python's zipfile) --------------
// Requires python3 (always present in the Replit environment where this runs).
if (spawnSync("python3", ["--version"]).status !== 0) {
  console.error("ERROR: python3 is required to build the zip but was not found on PATH.");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
rmSync(OUT_ZIP, { force: true });
console.log(`Zipping -> ${relative(PROJECT_DIR, OUT_ZIP)} ...`);
const pyZip = `
import sys, os, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for dp, _, fs in os.walk(src):
        for f in fs:
            full = os.path.join(dp, f)
            z.write(full, os.path.relpath(full, src))
`;
run("python3", ["-c", pyZip, STAGE, OUT_ZIP]);

// 4) Verify the actual archive (read entry names back out of the zip) ----------------
const pyList = `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print("\\n".join(z.namelist()))
`;
const listed = spawnSync("python3", ["-c", pyList, OUT_ZIP], { encoding: "utf8" });

// cleanup intermediates regardless of verification outcome
rmSync(STAGE, { recursive: true, force: true });
if (madeFreshBuild) rmSync(FRESH_BUILD, { recursive: true, force: true });

if (listed.status !== 0) {
  console.error("ERROR: could not read back the generated zip for verification.");
  console.error(listed.stderr || "");
  process.exit(1);
}
const entries = listed.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
const hasEntry = (name) => entries.some((e) => e === name || e.startsWith(name + "/"));
const required = ["index.html", "assets", "_expo", "READ_ME_FIRST.txt", "BUILD_INFO.json"];
const missing = required.filter((r) => !hasEntry(r));
const longest = entries.reduce((m, e) => (e.length > m.length ? e : m), "");
const sizeMB = (statSync(OUT_ZIP).size / 1e6).toFixed(1);

console.log("\n=== Handoff bundle verification (read back from the zip) ===");
console.log(`  output       : ${relative(PROJECT_DIR, OUT_ZIP)}  (${sizeMB} MB, ${entries.length} entries)`);
for (const r of required) console.log(`  ${(r + " ").padEnd(18)}: ${hasEntry(r) ? "present" : "MISSING"}`);
console.log(`  longest path : ${longest.length} chars`);

if (missing.length) {
  console.error(`\nERROR: bundle is missing required entries: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`\nDone. Hand dist-download/web-build.zip to the packaging project.\n`);
