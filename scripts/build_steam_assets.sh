#!/usr/bin/env bash
set -euo pipefail

# Builds all 8 Steam marketing capsules + relabels in-game screenshots.
# Source art: hand-drawn pen-and-ink dystopian cityscape, matching the menu
# landscape style. Title text is composed at build time so it stays crisp at
# every Steam-required size. The game's title is simply MEGACITY — no
# subtitles of any kind.

SRC=attached_assets/generated_images
OUT=steam_assets/marketing
SHOTS_IN=.canvas/assets
SHOTS_OUT=steam_assets/screenshots

HERO="$SRC/megacity_steam_hero_v2.png"
PORTRAIT="$SRC/megacity_steam_portrait_v2.png"
PANORAMA="$SRC/megacity_steam_panorama_v2.png"

mkdir -p "$OUT" "$SHOTS_OUT"

FONT="DejaVu-Sans-Bold"

# ---------------------------------------------------------------
# 01 Library Capsule  600x900  (portrait, with title)
# Shown in the user's library when the game is owned.
# ---------------------------------------------------------------
magick "$PORTRAIT" \
  -resize 600x900^ -gravity center -extent 600x900 \
  -font "$FONT" -kerning 12 -pointsize 86 \
  -fill white -stroke '#1a1a1a' -strokewidth 4 \
  -gravity north -annotate +0+50 'MEGACITY' \
  -stroke none -fill white \
  -gravity north -annotate +0+50 'MEGACITY' \
  "$OUT/01_Library_Capsule_600x900.png"

# ---------------------------------------------------------------
# 02 Library Hero  3840x1240  (ultra-wide, NO title; the Library Logo
# transparent PNG is overlaid on top of this banner by Steam.)
# ---------------------------------------------------------------
magick "$PANORAMA" \
  -resize 3840x1240^ -gravity center -extent 3840x1240 \
  "$OUT/02_Library_Hero_3840x1240.png"

# ---------------------------------------------------------------
# 03 Library Logo  1280x720  (transparent PNG, title only.)
# This is the title that floats above the Library Hero banner.
# ---------------------------------------------------------------
magick -size 1280x720 xc:none \
  -font "$FONT" -kerning 16 -pointsize 180 \
  -fill white -stroke '#1a1a1a' -strokewidth 5 \
  -gravity center -annotate +0+0 'MEGACITY' \
  -stroke none -fill white \
  -gravity center -annotate +0+0 'MEGACITY' \
  "$OUT/03_Library_Logo_1280x720.png"

# ---------------------------------------------------------------
# 04 Header Capsule  460x215  (with title)
# The main store thumbnail — search results, browse pages, friend activity.
# ---------------------------------------------------------------
magick "$HERO" \
  -resize 460x215^ -gravity center -extent 460x215 \
  -font "$FONT" -kerning 8 -pointsize 56 \
  -fill white -stroke '#1a1a1a' -strokewidth 3 \
  -gravity center -annotate +0+0 'MEGACITY' \
  -stroke none -fill white \
  -gravity center -annotate +0+0 'MEGACITY' \
  "$OUT/04_Header_Capsule_460x215.png"

# ---------------------------------------------------------------
# 05 Small Capsule  231x87  (very compact, just title)
# ---------------------------------------------------------------
magick "$HERO" \
  -resize 231x87^ -gravity center -extent 231x87 \
  -font "$FONT" -kerning 4 -pointsize 30 \
  -fill white -stroke '#1a1a1a' -strokewidth 2 \
  -gravity center -annotate +0+0 'MEGACITY' \
  -stroke none -fill white \
  -gravity center -annotate +0+0 'MEGACITY' \
  "$OUT/05_Small_Capsule_231x87.png"

# ---------------------------------------------------------------
# 06 Main Capsule  616x353  (front-page feature, with title)
# ---------------------------------------------------------------
magick "$HERO" \
  -resize 616x353^ -gravity center -extent 616x353 \
  -font "$FONT" -kerning 10 -pointsize 76 \
  -fill white -stroke '#1a1a1a' -strokewidth 4 \
  -gravity center -annotate +0+0 'MEGACITY' \
  -stroke none -fill white \
  -gravity center -annotate +0+0 'MEGACITY' \
  "$OUT/06_Main_Capsule_616x353.png"

# ---------------------------------------------------------------
# 07 Vertical Capsule  374x448  (sale headers, with title)
# ---------------------------------------------------------------
magick "$PORTRAIT" \
  -resize 374x448^ -gravity center -extent 374x448 \
  -font "$FONT" -kerning 8 -pointsize 56 \
  -fill white -stroke '#1a1a1a' -strokewidth 3 \
  -gravity north -annotate +0+30 'MEGACITY' \
  -stroke none -fill white \
  -gravity north -annotate +0+30 'MEGACITY' \
  "$OUT/07_Vertical_Capsule_374x448.png"

# ---------------------------------------------------------------
# 08 Page Background  1438x810  (atmospheric, no title)
# ---------------------------------------------------------------
magick "$PANORAMA" \
  -resize 1438x810^ -gravity center -extent 1438x810 \
  "$OUT/08_Page_Background_1438x810.png"

# ---------------------------------------------------------------
# Screenshots: relabel existing in-game shots with Steam-friendly names.
# These are real captures, not regenerated.
# ---------------------------------------------------------------
cp "$SHOTS_IN/ss_01_main_menu.png" "$SHOTS_OUT/screenshot_1_main_menu_1080x1920.png"
cp "$SHOTS_IN/ss_02_overview.png"  "$SHOTS_OUT/screenshot_2_city_overview_1080x1920.png"
cp "$SHOTS_IN/ss_03_economy.png"   "$SHOTS_OUT/screenshot_3_economy_1080x1920.png"
cp "$SHOTS_IN/ss_04_districts.png" "$SHOTS_OUT/screenshot_4_districts_1080x1920.png"
cp "$SHOTS_IN/ss_05_law.png"       "$SHOTS_OUT/screenshot_5_law_and_order_1080x1920.png"

echo "Done. Output:"
ls -la "$OUT" "$SHOTS_OUT"
