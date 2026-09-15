#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STEAM_DIR="$SCRIPT_DIR"

echo "=== MEGACITY Steam Build ==="
echo ""

echo "[1/5] Building Expo web export..."
if [ -f "$PROJECT_DIR/package.json" ]; then
  cd "$PROJECT_DIR"
  npx expo export --platform web --clear --output-dir "$STEAM_DIR/web-build"
  echo "    Web build complete."
elif [ -f "$STEAM_DIR/web-build/index.html" ]; then
  echo "    No Expo project found (standalone build kit) — using the pre-built"
  echo "    web-build/ that ships in this kit. Skipping export."
else
  echo "    ERROR: no Expo project at $PROJECT_DIR and no pre-built" >&2
  echo "    web-build/index.html. Cannot continue." >&2
  exit 1
fi

echo "[1b/5] Inlining web fonts as data-URI @font-face into index.html..."
echo "    (Chromium won't fetch fonts over the app:// scheme, so the nav-bar"
echo "     icon glyphs render blank unless the .ttf data is embedded inline.)"
node "$SCRIPT_DIR/scripts/inline-fonts.mjs" "$STEAM_DIR/web-build"
echo "    Fonts inlined."

echo "[1c/5] Flattening deep __node_modules asset paths (Windows MAX_PATH safety)..."
echo "    (A fresh Expo export emits assets up to ~309 chars deep; Windows refuses"
echo "     paths >= 260, so the bundle would fail to extract/build without this.)"
node "$SCRIPT_DIR/scripts/flatten-assets.mjs" "$STEAM_DIR/web-build"
echo "    Asset paths flattened."

echo "[2/5] Installing Electron + steamworks.js dependencies..."
cd "$STEAM_DIR"
npm install
echo "    Dependencies installed."

echo "[3/5] Copying Steam SDK redistributable binaries..."
SDK_REDIST="$STEAM_DIR/sdk/redistributable_bin"
if [ -d "$SDK_REDIST" ]; then
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    cp -f "$SDK_REDIST/win64/steam_api64.dll" "$STEAM_DIR/" 2>/dev/null || true
    echo "    Copied steam_api64.dll"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    cp -f "$SDK_REDIST/osx/libsteam_api.dylib" "$STEAM_DIR/" 2>/dev/null || true
    echo "    Copied libsteam_api.dylib"
  else
    cp -f "$SDK_REDIST/linux64/libsteam_api.so" "$STEAM_DIR/" 2>/dev/null || true
    echo "    Copied libsteam_api.so"
  fi
else
  echo "    WARNING: SDK redistributable binaries not found at $SDK_REDIST"
  echo "    Download from partner.steamgames.com and place in steam/sdk/"
fi

echo "[4/5] Building desktop binaries..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  echo "    Building for Windows..."
  npm run build:win
elif [[ "$OSTYPE" == "darwin"* ]]; then
  echo "    Building for macOS..."
  npm run build:mac
else
  echo "    Building for Linux..."
  npm run build:linux
fi
echo "    Build complete. Output in $STEAM_DIR/dist/"

echo "[5/5] Verifying configuration..."
if grep -q "0000000" "$STEAM_DIR/steam_appid.txt"; then
  echo "    WARNING: steam_appid.txt still contains placeholder ID (0000000)."
  echo "    Replace with your actual Steam App ID before uploading."
else
  echo "    steam_appid.txt: $(cat "$STEAM_DIR/steam_appid.txt")"
fi

echo ""
echo "=== Build Complete ==="
echo ""
echo "Next steps:"
echo "  1. Update steam_appid.txt with your real App ID"
echo "  2. Test locally: cd steam && npm start"
echo "  3. Export achievements: npm run export:achievements"
echo "  4. Export stats: npm run export:stats"
echo "  5. Upload to Steam via SteamPipe:"
echo "     steamcmd +login <user> +run_app_build app_build.vdf +quit"
