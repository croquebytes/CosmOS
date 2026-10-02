#!/bin/sh
# Save approved keyframes as committed webp anchors: key__tape__<name>.webp
# Usage: save_keys.sh name1 name2 ...   (reads key_<name>.png from the work dir)
W=/private/tmp/claude-501/-Users-karma-Documents-Machine-Dreams-projects-CosmOS/ca9b5e1f-b4da-472b-b0a7-5c18653300dc/scratchpad/tapes-work
R="/Users/karma/Documents/Machine Dreams/projects/CosmOS/.claude/worktrees/agent-ac3ce461027ff488b"
for n in "$@"; do
  cwebp -quiet -q 88 "$W/key_$n.png" -o "$R/assets/src/video/key__tape__$n.webp"
  ls -la "$R/assets/src/video/key__tape__$n.webp"
done
