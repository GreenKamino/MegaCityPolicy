#!/usr/bin/env bash
set -Eeuo pipefail

# Export and prepare the Steam web payload without touching the existing
# bundle until the new payload has passed every Windows extraction check.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STEAM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$STEAM_DIR/.." && pwd)"
WEB_BUILD="$STEAM_DIR/web-build"
WEB_BUILD_NEW="$STEAM_DIR/web-build-new"
WEB_BUILD_OLD="$STEAM_DIR/web-build-old"

phase="startup"
old_bundle_moved=false
swap_succeeded=false

restore_old_bundle() {
  if [[ "$old_bundle_moved" == true && "$swap_succeeded" != true ]]; then
    rm -rf "$WEB_BUILD"
    if [[ -d "$WEB_BUILD_OLD" ]]; then
      mv "$WEB_BUILD_OLD" "$WEB_BUILD"
      echo "Restored the previous Steam web bundle." >&2
    fi
  fi
}

cleanup() {
  local status=$?
  rm -rf "$WEB_BUILD_NEW"
  restore_old_bundle
  if [[ "$swap_succeeded" == true ]]; then
    rm -rf "$WEB_BUILD_OLD"
  fi

  if [[ "$status" -ne 0 ]]; then
    echo "" >&2
    echo "Steam web-bundle refresh failed during: $phase" >&2
    echo "Nothing was repacked; retry from artifacts/megacity after stopping the Expo/Metro dev workflow." >&2
    echo "Use: pnpm run steam:refresh-web" >&2
    echo "The export must use --no-minify (not --dev); a sandbox timeout can be retried safely." >&2
  fi
  return "$status"
}

on_interrupt() {
  echo "" >&2
  echo "Steam web-bundle refresh was interrupted (possibly by the sandbox time limit)." >&2
  echo "Retry from artifacts/megacity after stopping the Expo/Metro dev workflow." >&2
  exit 130
}

trap cleanup EXIT
trap on_interrupt INT TERM HUP

if [[ -e "$WEB_BUILD_OLD" ]]; then
  echo "ERROR: found a leftover $WEB_BUILD_OLD from an earlier refresh." >&2
  echo "Resolve that interrupted refresh before retrying; the current web-build was not changed." >&2
  exit 1
fi

# A running Expo dev server owns Metro and can make a second export hang at
# "Starting Metro Bundler". Do not kill a user's workflow from this script:
# fail before creating a new bundle and explain how to retry.
if command -v pgrep >/dev/null 2>&1; then
  metro_processes="$(pgrep -af 'expo[[:space:]]+(start|run)|@expo/cli.*start|metro' || true)"
  if [[ -n "$metro_processes" ]]; then
    echo "ERROR: an Expo/Metro dev process is already running:" >&2
    echo "$metro_processes" >&2
    echo "Stop the artifacts/megacity Expo workflow, then retry:" >&2
    echo "  pnpm run steam:refresh-web" >&2
    exit 1
  fi
fi

cd "$PROJECT_DIR"
rm -rf "$WEB_BUILD_NEW"

phase="Expo web export"
echo "==> Exporting a fresh Expo web bundle into steam/web-build-new"
if ! pnpm exec expo export --platform web --no-minify --output-dir "$WEB_BUILD_NEW"; then
  echo "ERROR: Expo export did not complete." >&2
  echo "A running Metro server or the sandbox command time limit can interrupt this step." >&2
  exit 1
fi

phase="font inlining"
echo "==> Inlining fonts"
node "$SCRIPT_DIR/inline-fonts.mjs" "$WEB_BUILD_NEW"

phase="Windows asset-path flattening"
echo "==> Flattening deep asset paths for Windows"
node "$SCRIPT_DIR/flatten-assets.mjs" "$WEB_BUILD_NEW"

phase="prepared bundle verification"
echo "==> Verifying the prepared bundle"
python3 - "$WEB_BUILD_NEW" <<'PY'
import sys
from pathlib import Path

web_build = Path(sys.argv[1])
entry_dir = web_build / "_expo" / "static" / "js" / "web"
entries = sorted(entry_dir.glob("entry-*.js"))
if len(entries) != 1:
    raise SystemExit(
        f"ERROR: expected exactly one entry-*.js in {entry_dir}, found {len(entries)}"
    )

files = [path for path in web_build.rglob("*") if path.is_file()]
offenders = [path for path in files if "__node_modules" in path.as_posix()]
if offenders:
    raise SystemExit(
        f"ERROR: prepared bundle still contains {len(offenders)} __node_modules path(s), "
        f"for example {offenders[0]}"
    )

if not (web_build / "index.html").is_file():
    raise SystemExit(f"ERROR: {web_build / 'index.html'} is missing")

longest = max(
    (len("resources/app/web-build/" + path.relative_to(web_build).as_posix()) for path in files),
    default=0,
)
if longest >= 260:
    raise SystemExit(
        f"ERROR: longest Windows path would be {longest} characters (must be under 260)"
    )

print(
    f"    bundle ok: {len(files)} files, {entries[0].name}, "
    f"zero __node_modules paths, longest path {longest} characters"
)
PY

phase="bundle swap"
echo "==> Swapping the prepared bundle into steam/web-build"
if [[ -e "$WEB_BUILD" ]]; then
  mv "$WEB_BUILD" "$WEB_BUILD_OLD"
  old_bundle_moved=true
fi
mv "$WEB_BUILD_NEW" "$WEB_BUILD"

phase="release manifest"
echo "==> Recording the shipped bundle in steam/release-manifest.json"
python3 - "$WEB_BUILD" "$PROJECT_DIR/package.json" "$STEAM_DIR/release-manifest.json" <<'PY'
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

web_build = Path(sys.argv[1])
app_package = Path(sys.argv[2])
manifest_path = Path(sys.argv[3])
entry_dir = web_build / "_expo" / "static" / "js" / "web"
entries = sorted(entry_dir.glob("entry-*.js"))
if len(entries) != 1:
    raise SystemExit(
        f"ERROR: expected exactly one entry-*.js in {entry_dir}, found {len(entries)}"
    )

entry = entries[0]
try:
    existing_manifest = json.loads(manifest_path.read_text())
    fixture_markers = existing_manifest["fixtureMarkers"]
    windows_release = existing_manifest["windowsRelease"]
except (FileNotFoundError, KeyError, json.JSONDecodeError) as exc:
    raise SystemExit(
        f"ERROR: {manifest_path} must define fixtureMarkers and windowsRelease before refreshing the Steam bundle"
    ) from exc
if not isinstance(fixture_markers, dict) or not fixture_markers:
    raise SystemExit(
        f"ERROR: {manifest_path} fixtureMarkers must be a non-empty object"
    )
if (
    not isinstance(windows_release, dict)
    or not isinstance(windows_release.get("runnerLabels"), list)
    or not windows_release["runnerLabels"]
    or not isinstance(windows_release.get("executable"), str)
    or not windows_release["executable"]
):
    raise SystemExit(
        f"ERROR: {manifest_path} windowsRelease must define runnerLabels and executable"
    )

manifest = {
    "appVersion": json.loads(app_package.read_text())["version"],
    "entryBundle": entry.name,
    "bundleSha256": hashlib.sha256(entry.read_bytes()).hexdigest(),
    "fixtureMarkers": fixture_markers,
    "windowsRelease": windows_release,
    "generatedAt": datetime.now(timezone.utc)
    .replace(microsecond=0)
    .isoformat()
    .replace("+00:00", "Z"),
}
tmp = manifest_path.with_suffix(".tmp.json")
try:
    tmp.write_text(json.dumps(manifest, indent=2) + "\n")
    os.replace(tmp, manifest_path)
finally:
    if tmp.exists():
        tmp.unlink()
print(
    f"    manifest: v{manifest['appVersion']}, {manifest['entryBundle']}, "
    f"sha256 {manifest['bundleSha256']}"
)
PY

swap_succeeded=true

echo ""
echo "Steam web bundle refreshed."
echo "Next step: python3 steam/scripts/repack-deliverables.py"