#!/bin/sh
# Download a finished raw reel and build a 6-frame contact strip (4:3 crop marked).
# Usage: tapes-review.sh <stem-without-__720> <url>    e.g. tape__t2__shot2 https://...mp4
W=/private/tmp/claude-501/-Users-karma-Documents-Machine-Dreams-projects-CosmOS/ca9b5e1f-b4da-472b-b0a7-5c18653300dc/scratchpad/tapes-work
R="/Users/karma/Documents/Machine Dreams/projects/CosmOS/.claude/worktrees/agent-ac3ce461027ff488b"
stem="$1"; url="$2"
raw="$R/assets/src/video/raw__${stem}__720.mp4"
[ -f "$raw" ] || curl -s -o "$raw" "$url"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$raw")
wh=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$raw")
echo "$stem duration=$d size=$wh"
# six evenly spaced frames, each with the centre-75% (4:3) window outlined
fps=$(echo "$d" | awk '{printf "%.4f", 6/$1}')
ffmpeg -hide_banner -loglevel error -y -i "$raw" -vf "fps=$fps,scale=640:-1,drawbox=x=80:y=0:w=480:h=ih:color=yellow@0.6:t=2,tile=3x2" -frames:v 1 "$W/strip_${stem}.png"
echo "$W/strip_${stem}.png"
