#!/usr/bin/env bash
# Regenerates every raster app asset from the SVG sources in
# mobile/assets/src/. Run after changing the mark; commit the output.
#
# Requires: rsvg-convert (librsvg), magick (ImageMagick 7).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/mobile/assets/src"
out="$root/mobile/assets"

BG="#0a0a0a"

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
need rsvg-convert
need magick

echo "==> app icon (1024, full bleed)"
rsvg-convert -w 820 -h 820 "$src/mark.svg" -o /tmp/bf-mark.png
magick -size 1024x1024 "xc:$BG" /tmp/bf-mark.png -gravity center -composite \
  -strip "$out/icon.png"

# Adaptive icons get a 108dp canvas of which only the centre ~66dp is
# guaranteed visible, so the mark is rendered smaller and padded out.
echo "==> adaptive icon foreground (1024, transparent)"
rsvg-convert -w 838 -h 838 "$src/mark.svg" -o /tmp/bf-mark-adaptive.png
magick -size 1024x1024 xc:none /tmp/bf-mark-adaptive.png -gravity center -composite \
  -strip "$out/adaptive-icon.png"

echo "==> adaptive icon monochrome (Android 13 themed icons)"
rsvg-convert -w 838 -h 838 "$src/mark-mono.svg" -o /tmp/bf-mono-adaptive.png
magick -size 1024x1024 xc:none /tmp/bf-mono-adaptive.png -gravity center -composite \
  -strip "$out/adaptive-icon-mono.png"

echo "==> splash (1024, transparent — background comes from app.config.js)"
rsvg-convert -w 640 -h 640 "$src/mark.svg" -o /tmp/bf-splash.png
magick -size 1024x1024 xc:none /tmp/bf-splash.png -gravity center -composite \
  -strip "$out/splash.png"

# The status bar keeps only the alpha channel of this one, so it must be
# a solid white silhouette with breathing room around it.
echo "==> notification icon (96, white silhouette)"
rsvg-convert -w 72 -h 72 "$src/mark-mono.svg" -o /tmp/bf-notif.png
magick -size 96x96 xc:none /tmp/bf-notif.png -gravity center -composite \
  -strip "$out/notification-icon.png"

echo "==> Play Store icon (512, no alpha — Play rejects transparency)"
rsvg-convert -w 410 -h 410 "$src/mark.svg" -o /tmp/bf-store.png
magick -size 512x512 "xc:$BG" /tmp/bf-store.png -gravity center -composite \
  -background "$BG" -alpha remove -alpha off -strip "$root/store/play-icon-512.png"

rm -f /tmp/bf-*.png
echo
echo "Generated:"
( cd "$root" && ls -la mobile/assets/*.png store/play-icon-512.png )
