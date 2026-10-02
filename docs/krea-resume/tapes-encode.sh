#!/bin/sh
# Encode a tape shot at 960x720 with tools/encode_reel.sh; if either video file is
# over the 600 KB budget, re-encode both with a copy of its commands at a higher CRF.
# Usage: tapes-encode.sh <stem-without-__720> [posterSec]
R="/Users/karma/Documents/Machine Dreams/projects/CosmOS/.claude/worktrees/agent-ac3ce461027ff488b"
cd "$R" || exit 1
stem="$1"; at="${2:-2}"
full="${stem}__720"; src="assets/src/video/raw__${full}.mp4"
sh tools/encode_reel.sh "$src" "$full" "$at" 960 720 >/dev/null
size() { stat -f %z "$1"; }
budget=614400
vcrf=36; hcrf=26
scale="scale=960:720:force_original_aspect_ratio=increase,crop=960:720"
while [ "$(size assets/video/$full.webm)" -gt $budget ] || [ "$(size assets/video/$full.mp4)" -gt $budget ]; do
  vcrf=$((vcrf + 3)); hcrf=$((hcrf + 2))
  [ $vcrf -gt 50 ] && break
  if [ "$(size assets/video/$full.webm)" -gt $budget ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$src" -an -vf "$scale" \
      -c:v libvpx-vp9 -b:v 0 -crf $vcrf -row-mt 1 -deadline good -cpu-used 2 "assets/video/$full.webm"
  fi
  if [ "$(size assets/video/$full.mp4)" -gt $budget ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$src" -an -vf "$scale" \
      -c:v libx264 -preset slow -crf $hcrf -pix_fmt yuv420p -movflags +faststart "assets/video/$full.mp4"
  fi
done
echo "$full webm=$(size assets/video/$full.webm) mp4=$(size assets/video/$full.mp4) webp=$(size assets/video/$full.webp) (vp9 crf<=$vcrf, x264 crf<=$hcrf)"
