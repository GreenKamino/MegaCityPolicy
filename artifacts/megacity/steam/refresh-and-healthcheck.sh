#!/usr/bin/env bash
set -Eeuo pipefail

# Refresh the existing Steam bundle without rebuilding Electron. The Windows
# runtime is carried by dist-download/megacity-desktop-windows.zip; only the
# Expo web payload needs to be regenerated after game code/content changes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_BUILD="$SCRIPT_DIR/web-build"
WEB_BUILD_NEW="$SCRIPT_DIR/web-build-new"
WEB_BUILD_OLD="$SCRIPT_DIR/web-build-old"
refresh_succeeded=false

restore_old_bundle() {
  if [[ "$refresh_succeeded" != true && -d "$WEB_BUILD_OLD" ]]; then
    rm -rf "$WEB_BUILD"
    mv "$WEB_BUILD_OLD" "$WEB_BUILD"
    echo "Restored the previous Steam web bundle after an incomplete refresh." >&2
  fi
}

cleanup() {
  rm -rf "$WEB_BUILD_NEW"
  restore_old_bundle
  if [[ "$refresh_succeeded" == true ]]; then
    rm -rf "$WEB_BUILD_OLD"
  fi
}
trap cleanup EXIT

cd "$PROJECT_DIR"
rm -rf "$WEB_BUILD_NEW" "$WEB_BUILD_OLD"

echo "==> Exporting a fresh Expo web bundle"
pnpm exec expo export --platform web --no-minify --output-dir "$WEB_BUILD_NEW"

echo "==> Inlining fonts"
node "$SCRIPT_DIR/scripts/inline-fonts.mjs" "$WEB_BUILD_NEW"

echo "==> Flattening deep asset paths for Windows"
node "$SCRIPT_DIR/scripts/flatten-assets.mjs" "$WEB_BUILD_NEW"

entry_count="$(find "$WEB_BUILD_NEW/_expo/static/js/web" -maxdepth 1 -type f -name 'entry-*.js' | wc -l | tr -d ' ')"
if [[ "$entry_count" != "1" ]]; then
  echo "ERROR: expected exactly one fresh entry bundle, found $entry_count" >&2
  exit 1
fi

echo "==> Swapping the prepared bundle into steam/web-build"
if [[ -d "$WEB_BUILD" ]]; then
  mv "$WEB_BUILD" "$WEB_BUILD_OLD"
fi
mv "$WEB_BUILD_NEW" "$WEB_BUILD"

echo "==> Repacking downloadable Steam deliverables"
python3 "$SCRIPT_DIR/scripts/repack-deliverables.py"

echo "==> Running Steam bundle health checks"
node --check "$SCRIPT_DIR/main.js"
node --check "$SCRIPT_DIR/preload.js"
node --check "$SCRIPT_DIR/closeGuard.js"
python3 "$SCRIPT_DIR/scripts/check-refresh-health.py"

refresh_succeeded=true
echo ""
echo "Steam bundle refresh complete."
echo "Run from artifacts/megacity: pnpm run steam:refresh"