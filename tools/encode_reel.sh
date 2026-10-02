#!/bin/sh
# Turn a generated master (any video) into the drop-in set js/media.js loads:
#   assets/video/<stem>.webm   VP9, silent, the preferred source
#   assets/video/<stem>.mp4    H.264, silent, faststart: the fallback
#   assets/video/<stem>.webp   poster: what reduced-motion players see
# Reels are always muted in-game (sound comes from game.sfx), so audio is dropped.
#
#   tools/encode_reel.sh <master.mp4> <stem> [poster-seconds] [width] [height]
#   tools/encode_reel.sh assets/src/video/raw__ship.mp4 cine__ship-the-build__720 1.2
#
# Budgets (docs/VISUAL_UPGRADE_PLAN.md §5): cinematics <= 2.5 MB at 1280x720.
set -eu
src="$1"; stem="$2"; at="${3:-1}"; w="${4:-1280}"; h="${5:-720}"
out="assets/video"; mkdir -p "$out"
scale="scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}"
ffmpeg -hide_banner -loglevel error -y -i "$src" -an -vf "$scale" \
  -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -deadline good -cpu-used 2 "$out/$stem.webm"
ffmpeg -hide_banner -loglevel error -y -i "$src" -an -vf "$scale" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "$out/$stem.mp4"
# This ffmpeg build has no libwebp: grab the frame as PNG, encode with cwebp.
tmp="$(mktemp -t reelposter).png"
ffmpeg -hide_banner -loglevel error -y -ss "$at" -i "$src" -frames:v 1 -vf "$scale" "$tmp"
cwebp -quiet -q 82 "$tmp" -o "$out/$stem.webp"
rm -f "$tmp"
ls -la "$out/$stem".*
