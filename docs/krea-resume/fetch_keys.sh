#!/bin/sh
# Download keyframes listed as "<name> <url>" lines in keys.txt, plus a 1000px preview.
W=/private/tmp/claude-501/-Users-karma-Documents-Machine-Dreams-projects-CosmOS/ca9b5e1f-b4da-472b-b0a7-5c18653300dc/scratchpad/tapes-work
cd "$W" || exit 1
while read -r name url; do
  [ -z "$name" ] && continue
  [ -f "key_$name.full" ] && continue
  curl -s -o "key_$name.full" "$url"
  sips -s format png "key_$name.full" --out "key_$name.png" >/dev/null
  sips -Z 1000 "key_$name.png" --out "prev_$name.png" >/dev/null
  echo "$name $(sips -g pixelWidth -g pixelHeight key_$name.png | tail -2 | awk '{print $2}' | tr '\n' 'x')"
done < keys.txt
