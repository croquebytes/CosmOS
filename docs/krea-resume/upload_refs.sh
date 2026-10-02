#!/bin/sh
# Upload the existing reel keyframes to Krea for reuse as references.
U="$1"
W=/private/tmp/claude-501/-Users-karma-Documents-Machine-Dreams-projects-CosmOS/ca9b5e1f-b4da-472b-b0a7-5c18653300dc/scratchpad/tapes-work
R="/Users/karma/Documents/Machine Dreams/projects/CosmOS/.claude/worktrees/agent-ac3ce461027ff488b"
for k in ship-the-build sev1-alarm mirror-login; do
  dwebp -quiet "$R/assets/src/video/key__$k.webp" -o "$W/key_$k.png"
  echo "$k"
  curl -s -X POST "$U" -F "file=@$W/key_$k.png"
  echo
done
