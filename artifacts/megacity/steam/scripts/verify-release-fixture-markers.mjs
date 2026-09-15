import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const STEAM_DIR = resolve(import.meta.dirname, "..");
const WEB_BUILD = join(STEAM_DIR, "web-build");
const MANIFEST_PATH = join(STEAM_DIR, "release-manifest.json");
const REFRESH_COMMAND = "pnpm run steam:refresh-web";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(MANIFEST_PATH)) {
  fail(`Steam release manifest is missing at ${MANIFEST_PATH}. Refresh with: ${REFRESH_COMMAND}`);
} else {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const entryName = manifest.entryBundle ?? "(unknown entry bundle)";
  const entryPath = join(WEB_BUILD, "_expo", "static", "js", "web", entryName);
  const markerEntries = Object.entries(manifest.fixtureMarkers ?? {});

  if (!markerEntries.length) {
    fail(
      `Steam release manifest has no fixture markers for bundle ${entryName}. ` +
        `Refresh with: ${REFRESH_COMMAND}`,
    );
  } else if (!existsSync(entryPath)) {
    fail(
      `stale Steam web bundle: ${entryPath} is missing. ` +
        `Refresh with: ${REFRESH_COMMAND}`,
    );
  } else {
    const bundleText = readFileSync(entryPath, "utf8");
    const missing = markerEntries.filter(
      ([name, marker]) => typeof marker !== "string" || !bundleText.includes(marker),
    );

    if (missing.length) {
      const details = missing
        .map(([name, marker]) => `${name}=${JSON.stringify(marker)}`)
        .join(", ");
      fail(
        `stale Steam web bundle: ${entryPath} is missing release fixture marker(s) ${details}. ` +
          `Refresh with: ${REFRESH_COMMAND}`,
      );
    } else {
      console.log(
        `Steam web bundle fixture markers verified: ${entryPath} ` +
          `(${markerEntries.map(([name]) => name).join(", ")})`,
      );
    }
  }
}