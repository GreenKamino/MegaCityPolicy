#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="/tmp/megacity-itchio"
ZIP_FILE="/home/runner/workspace/MEGACITY_itchio_v1.4.0.zip"

echo "=== MEGACITY itch.io Web Export ==="
echo "Building web export..."

cd "$PROJECT_DIR"

rm -rf "$OUTPUT_DIR"

npx expo export --platform web --output-dir "$OUTPUT_DIR" 2>&1 || true

if [ ! -d "$OUTPUT_DIR" ]; then
  echo "ERROR: Export failed — output directory not created"
  exit 1
fi

echo "Inlining fonts (icons + Inter) for browser rendering..."
node "$PROJECT_DIR/steam/scripts/inline-fonts.mjs" "$OUTPUT_DIR"

cat > "$OUTPUT_DIR/index.html.bak" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>MEGACITY — Dystopian City Simulator</title>
<style>
  html, body, #root { margin:0; padding:0; width:100%; height:100%; background:#0A0F0A; overflow:hidden; }
</style>
</head>
<body>
<div id="root"></div>
</body>
</html>
HTMLEOF

cd "$OUTPUT_DIR"
rm -f "$ZIP_FILE"

cd /tmp
zip -r "$ZIP_FILE" megacity-itchio/

echo ""
echo "=== Export Complete ==="
echo "ZIP: $ZIP_FILE"
echo "Size: $(du -h "$ZIP_FILE" | cut -f1)"
echo ""
echo "Upload this ZIP to itch.io as an HTML5 game."
echo "Set 'This file will be played in the browser' when uploading."
echo ""
echo "Pricing setup on itch.io:"
echo "  - Base game: Free (or pay-what-you-want)"
echo "  - All Addons unlock: \$15.00 tier"
echo "  - Link paid tier to: yourgame.itch.io/megacity?unlock=all"
